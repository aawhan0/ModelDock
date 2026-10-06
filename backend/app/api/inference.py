import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from time import perf_counter
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_scope
from app.models.inference_request import InferenceRequest
from app.models.inference_job import InferenceJob
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore, verify_artifact
from app.services.metrics import (
    get_inference_request,
    metrics_collector,
    record_inference_request,
    record_persistent_metric,
)
from app.services.runtime_registry import runtime_registry
from app.services.inference_jobs import artifact_store as job_artifact_store
from app.services.inference_jobs import submit_inference_job

router = APIRouter(
    prefix="/models",
    tags=["inference"],
    dependencies=[Depends(require_scope("inference:execute"))],
)
artifact_store = job_artifact_store


class PredictionRequest(BaseModel):
    input: Any


class PredictionResponse(BaseModel):
    model: str
    version: str
    prediction: Any
    prediction_id: int
    request_id: UUID
    latency_ms: float


class BatchPredictionRequest(BaseModel):
    inputs: list[Any] = Field(min_length=1, max_length=1000)

    @field_validator("inputs")
    @classmethod
    def validate_batch_size(cls, value: list[Any]) -> list[Any]:
        if len(value) > settings.max_batch_size:
            raise ValueError(f"Batch size exceeds configured maximum of {settings.max_batch_size}")
        return value


class BatchPredictionItem(BaseModel):
    index: int
    success: bool
    prediction: Any | None = None
    prediction_id: int | None = None
    request_id: UUID
    latency_ms: float | None = None
    error: str | None = None


class BatchPredictionResponse(BaseModel):
    model: str
    version: str
    request_id: UUID
    total: int
    successful: int
    failed: int
    latency_ms: float
    results: list[BatchPredictionItem]


class InferenceJobSubmission(BaseModel):
    job_id: UUID
    model_id: int
    version: str
    status: str
    created_at: datetime


class InferenceJobResponse(InferenceJobSubmission):
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None
    latency_ms: float
    started_at: datetime | None = None
    completed_at: datetime | None = None


def _resolve_request_id(value: UUID | None) -> UUID:
    return value or uuid4()


def _request_hash(model_id: int, version: str, payload: BaseModel) -> str:
    canonical = json.dumps(
        {"model_id": model_id, "version": version, "payload": payload.model_dump(mode="json")},
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _validate_idempotency_key(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if not value or len(value) > 255:
        raise HTTPException(status_code=400, detail="Idempotency-Key must contain 1 to 255 characters")
    return value


def _job_response(job: InferenceJob) -> InferenceJobResponse:
    error = None
    if job.error_code is not None and job.error_message is not None:
        error = {"code": job.error_code, "message": job.error_message}
    return InferenceJobResponse(
        job_id=job.job_id,
        model_id=job.model_id,
        version=job.version,
        status=job.status,
        created_at=job.created_at,
        result=job.result_payload,
        error=error,
        latency_ms=round(job.latency_ms, 3),
        started_at=job.started_at,
        completed_at=job.completed_at,
    )


def _is_stale(request: InferenceRequest) -> bool:
    created_at = request.created_at
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc) - created_at >= timedelta(seconds=settings.idempotency_ttl_seconds)


def _reserve_idempotency(
    db: Session,
    *,
    request_id: UUID,
    idempotency_key: str | None,
    request_hash: str,
    model_id: int,
    version: str,
    endpoint: str,
) -> InferenceRequest | None:
    if idempotency_key is None:
        if get_inference_request(db, request_id) is not None:
            raise HTTPException(status_code=409, detail="Request ID has already been used")
        return None

    existing = db.query(InferenceRequest).filter(InferenceRequest.idempotency_key == idempotency_key).first()
    if existing is not None and _is_stale(existing):
        db.delete(existing)
        db.commit()
        existing = None
    if existing is not None:
        if existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail="Idempotency-Key was already used for a different request")
        if existing.response_payload is not None and existing.response_status is not None:
            return existing
        raise HTTPException(status_code=409, detail="A request with this Idempotency-Key is already in progress")

    reservation = InferenceRequest(
        request_id=request_id,
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        model_id=model_id,
        version=version,
        endpoint=endpoint,
        status="in_progress",
        latency_ms=0.0,
    )
    db.add(reservation)
    try:
        db.commit()
        db.refresh(reservation)
    except IntegrityError:
        db.rollback()
        existing = db.query(InferenceRequest).filter(InferenceRequest.idempotency_key == idempotency_key).first()
        if existing is None or existing.request_hash != request_hash:
            raise HTTPException(status_code=409, detail="Idempotency-Key could not be reserved") from None
        if existing.response_payload is not None and existing.response_status is not None:
            return existing
        raise HTTPException(status_code=409, detail="A request with this Idempotency-Key is already in progress") from None
    return reservation


def _replay_idempotent_response(existing: InferenceRequest) -> PredictionResponse | BatchPredictionResponse:
    if existing.response_payload is None:
        raise HTTPException(status_code=409, detail="A request with this Idempotency-Key is already in progress")
    if existing.response_status and existing.response_status >= 400:
        error = existing.response_payload.get("error", {})
        raise HTTPException(status_code=existing.response_status, detail=error.get("message", "Request failed"))
    if existing.endpoint == "predict":
        return PredictionResponse.model_validate(existing.response_payload)
    return BatchPredictionResponse.model_validate(existing.response_payload)


def _store_idempotent_response(
    db: Session,
    reservation: InferenceRequest | None,
    *,
    response: BaseModel | None,
    response_status: int,
    error: str | None,
) -> None:
    if reservation is None:
        return
    reservation.response_payload = response.model_dump(mode="json") if response is not None else {
        "error": {"code": response_status, "message": error or "Inference failed"}
    }
    reservation.response_status = response_status
    reservation.status = "success" if response_status < 400 else "failed"
    reservation.error = error
    db.commit()


async def _run_prediction(runtime: Any, loaded_model: Any, value: Any) -> Any:
    return await asyncio.wait_for(
        run_in_threadpool(runtime.predict, loaded_model, value),
        timeout=settings.inference_timeout_seconds,
    )


@router.post("/{model_id}/versions/{version}/predict", response_model=PredictionResponse)
async def predict(
    model_id: int,
    version: str,
    payload: PredictionRequest,
    db: Session = Depends(get_db),
    request_id: UUID | None = Header(default=None, alias="X-Request-ID"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> PredictionResponse:
    request_id = _resolve_request_id(request_id)
    idempotency_key = _validate_idempotency_key(idempotency_key)
    started_at = perf_counter()
    metrics_key = f"{model_id}:{version}"
    success = False
    prediction: Any = None
    error_detail: str | None = None
    error_status = 500
    metric_id: int | None = None
    model_name = ""
    response: PredictionResponse | None = None
    reservation: InferenceRequest | None = None

    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    model_name = model.name
    model_version = db.query(ModelVersion).filter(
        ModelVersion.model_id == model_id, ModelVersion.version == version
    ).first()
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status != "deployed":
        raise HTTPException(status_code=409, detail="Model version is not deployed")
    if not model_version.artifact_path:
        raise HTTPException(status_code=404, detail="Model artifact not found")

    reservation = _reserve_idempotency(
        db,
        request_id=request_id,
        idempotency_key=idempotency_key,
        request_hash=_request_hash(model_id, version, payload),
        model_id=model_id,
        version=version,
        endpoint="predict",
    )
    if reservation is not None and reservation.response_payload is not None:
        return _replay_idempotent_response(reservation)  # type: ignore[return-value]

    try:
        try:
            artifact_path = artifact_store.resolve(model_version.artifact_path)
            if model_version.artifact_sha256 and not verify_artifact(
                artifact_path, model_version.artifact_sha256, model_version.artifact_size_bytes
            ):
                error_detail = "Model artifact integrity check failed"
                error_status = 409
                raise HTTPException(status_code=error_status, detail=error_detail)
            runtime = runtime_registry.get(model_version.framework)
            loaded_model = await asyncio.wait_for(
                run_in_threadpool(runtime.get_or_load, str(artifact_path)),
                timeout=settings.inference_timeout_seconds,
            )
            prediction = await _run_prediction(runtime, loaded_model, payload.input)
        except FileNotFoundError as exc:
            error_detail = "Model artifact not found"
            error_status = 404
            raise HTTPException(status_code=error_status, detail=error_detail) from exc
        except asyncio.TimeoutError as exc:
            error_detail = "Model inference timed out"
            error_status = 504
            raise HTTPException(status_code=error_status, detail=error_detail) from exc
        except ValueError as exc:
            error_detail = str(exc)
            error_status = 422
            raise HTTPException(status_code=error_status, detail=error_detail) from exc
        except (TypeError, SyntaxError) as exc:
            error_detail = str(exc)
            error_status = 422
            raise HTTPException(status_code=error_status, detail=error_detail) from exc
        except HTTPException as exc:
            error_detail = str(exc.detail)
            error_status = exc.status_code
            raise
        except Exception as exc:
            error_detail = "Model inference failed"
            error_status = 500
            raise HTTPException(status_code=error_status, detail=error_detail) from exc

        success = True
        error_status = 200
        response = PredictionResponse(
            model=model_name,
            version=model_version.version,
            prediction=prediction,
            prediction_id=0,
            request_id=request_id,
            latency_ms=round((perf_counter() - started_at) * 1000, 3),
        )
    finally:
        latency_ms = (perf_counter() - started_at) * 1000
        metrics_collector.record(metrics_key, latency_ms, success)
        try:
            metric_id = record_persistent_metric(
                db, model_id, version, latency_ms, success,
                input_text=str(payload.input),
                prediction=None if prediction is None else str(prediction), error=error_detail,
            )
            if reservation is None:
                record_inference_request(
                    db,
                    request_id=request_id,
                    model_id=model_id,
                    version=version,
                    endpoint="predict",
                    status="success" if success else "failed",
                    latency_ms=latency_ms,
                    prediction_metric_id=metric_id,
                    error=error_detail,
                )
            else:
                reservation.prediction_metric_id = metric_id
                reservation.latency_ms = max(0.0, latency_ms)
                if response is not None and metric_id is not None:
                    response.prediction_id = metric_id
                    response.latency_ms = round(latency_ms, 3)
                _store_idempotent_response(
                    db,
                    reservation,
                    response=response,
                    response_status=error_status,
                    error=error_detail,
                )
        except Exception:
            db.rollback()

    if response is None or metric_id is None:
        if error_status >= 400 and error_detail:
            raise HTTPException(status_code=error_status, detail=error_detail)
        raise HTTPException(status_code=500, detail="Inference telemetry could not be persisted")
    response.prediction_id = metric_id
    response.latency_ms = round(latency_ms, 3)
    return response


@router.post(
    "/{model_id}/versions/{version}/predict/async",
    response_model=InferenceJobSubmission,
    status_code=202,
)
def submit_prediction_job(
    model_id: int,
    version: str,
    payload: PredictionRequest,
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> InferenceJobSubmission:
    idempotency_key = _validate_idempotency_key(idempotency_key)
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    model_version = db.query(ModelVersion).filter(
        ModelVersion.model_id == model_id, ModelVersion.version == version
    ).first()
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status != "deployed":
        raise HTTPException(status_code=409, detail="Model version is not deployed")
    if not model_version.artifact_path:
        raise HTTPException(status_code=404, detail="Model artifact not found")

    request_hash = _request_hash(model_id, version, payload)
    if idempotency_key is not None:
        existing = db.query(InferenceJob).filter(InferenceJob.idempotency_key == idempotency_key).first()
        if existing is not None:
            if existing.request_hash != request_hash:
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used for a different request")
            return InferenceJobSubmission.model_validate(_job_response(existing), from_attributes=True)

    job = InferenceJob(
        job_id=uuid4(),
        idempotency_key=idempotency_key,
        request_hash=request_hash,
        model_id=model_id,
        version=version,
        status="queued",
        input_payload=payload.model_dump(mode="json"),
        latency_ms=0.0,
    )
    db.add(job)
    try:
        db.commit()
        db.refresh(job)
    except IntegrityError:
        db.rollback()
        if idempotency_key is not None:
            existing = db.query(InferenceJob).filter(InferenceJob.idempotency_key == idempotency_key).first()
            if existing is not None and existing.request_hash == request_hash:
                return InferenceJobSubmission.model_validate(_job_response(existing), from_attributes=True)
        raise HTTPException(status_code=409, detail="Idempotency-Key could not be reserved") from None

    try:
        submit_inference_job(job.job_id, db.get_bind())
    except Exception:
        job.status = "failed"
        job.error_code = 503
        job.error_message = "Inference job could not be scheduled"
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
    return InferenceJobSubmission(
        job_id=job.job_id,
        model_id=job.model_id,
        version=job.version,
        status=job.status,
        created_at=job.created_at,
    )


@router.get("/inference-jobs/{job_id}", response_model=InferenceJobResponse)
def get_prediction_job(job_id: UUID, db: Session = Depends(get_db)) -> InferenceJobResponse:
    job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Inference job not found")
    return _job_response(job)


@router.post("/{model_id}/versions/{version}/predict/batch", response_model=BatchPredictionResponse)
async def predict_batch(
    model_id: int,
    version: str,
    payload: BatchPredictionRequest,
    db: Session = Depends(get_db),
    request_id: UUID | None = Header(default=None, alias="X-Request-ID"),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> BatchPredictionResponse:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    model_version = db.query(ModelVersion).filter(
        ModelVersion.model_id == model_id, ModelVersion.version == version
    ).first()
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status != "deployed":
        raise HTTPException(status_code=409, detail="Model version is not deployed")

    batch_request_id = _resolve_request_id(request_id)
    idempotency_key = _validate_idempotency_key(idempotency_key)
    reservation = _reserve_idempotency(
        db,
        request_id=batch_request_id,
        idempotency_key=idempotency_key,
        request_hash=_request_hash(model_id, version, payload),
        model_id=model_id,
        version=version,
        endpoint="predict_batch",
    )
    if reservation is not None and reservation.response_payload is not None:
        return _replay_idempotent_response(reservation)  # type: ignore[return-value]

    started_at = perf_counter()
    results: list[BatchPredictionItem] = []
    for index, item in enumerate(payload.inputs):
        item_started_at = perf_counter()
        item_request_id = uuid4()
        try:
            prediction_response = await predict(
                model_id=model_id,
                version=version,
                payload=PredictionRequest(input=item),
                db=db,
                request_id=item_request_id,
                idempotency_key=None,
            )
            results.append(BatchPredictionItem(
                index=index,
                success=True,
                prediction=prediction_response.prediction,
                prediction_id=prediction_response.prediction_id,
                request_id=prediction_response.request_id,
                latency_ms=prediction_response.latency_ms,
            ))
        except HTTPException as exc:
            results.append(BatchPredictionItem(
                index=index,
                success=False,
                request_id=item_request_id,
                latency_ms=round((perf_counter() - item_started_at) * 1000, 3),
                error=str(exc.detail),
            ))

    successful = sum(1 for item in results if item.success)
    response = BatchPredictionResponse(
        model=model.name,
        version=version,
        request_id=batch_request_id,
        total=len(results),
        successful=successful,
        failed=len(results) - successful,
        latency_ms=round((perf_counter() - started_at) * 1000, 3),
        results=results,
    )
    if reservation is not None:
        reservation.latency_ms = response.latency_ms
        reservation.status = "success" if successful else "failed"
        _store_idempotent_response(db, reservation, response=response, response_status=200, error=None)
    return response
