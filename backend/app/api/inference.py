from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.models.inference_job import InferenceJob
from app.services.async_jobs import decode_prediction, enqueue_job
from app.services.artifact_store import LocalArtifactStore
from app.services.metrics import metrics_collector, record_persistent_metric
from app.services.runtime_registry import runtime_registry

router = APIRouter(prefix="/models", tags=["inference"])
jobs_router = APIRouter(prefix="/inference-jobs", tags=["inference"])
artifact_store = LocalArtifactStore()


class PredictionRequest(BaseModel):
    input: Any


class PredictionResponse(BaseModel):
    model: str
    version: str
    prediction: Any


class InferenceJobResponse(BaseModel):
    id: str
    model_id: int
    version: str
    status: str
    prediction: Any | None = None
    error: str | None = None
    latency_ms: float | None = None
    created_at: Any
    updated_at: Any


def _get_deployed_version(db: Session, model_id: int, version: str) -> tuple[Model, ModelVersion]:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status != "deployed":
        raise HTTPException(status_code=409, detail="Model version is not deployed")
    if not model_version.artifact_path:
        raise HTTPException(status_code=404, detail="Model artifact not found")
    try:
        artifact_available = artifact_store.resolve(model_version.artifact_path).is_file()
    except ValueError:
        artifact_available = False
    if not artifact_available:
        raise HTTPException(status_code=404, detail="Model artifact not found")
    return model, model_version


def _job_response(job: InferenceJob) -> InferenceJobResponse:
    return InferenceJobResponse(
        id=job.id,
        model_id=job.model_id,
        version=job.version,
        status=job.status,
        prediction=decode_prediction(job) if job.status == "completed" else None,
        error=job.error if job.status == "failed" else None,
        latency_ms=job.latency_ms,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.post(
    "/{model_id}/versions/{version}/predict/async",
    response_model=InferenceJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def submit_async_prediction(
    model_id: int,
    version: str,
    payload: PredictionRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key", max_length=255),
    db: Session = Depends(get_db),
) -> InferenceJobResponse:
    model, model_version = _get_deployed_version(db, model_id, version)
    job = enqueue_job(
        db,
        model_id,
        version,
        model_version.framework,
        model_version.artifact_path,
        payload.input,
        idempotency_key,
        artifact_store,
    )
    return _job_response(job)


@jobs_router.get("/{job_id}", response_model=InferenceJobResponse)
def get_async_prediction(job_id: str, db: Session = Depends(get_db)) -> InferenceJobResponse:
    job = db.get(InferenceJob, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Inference job not found")
    return _job_response(job)


@router.post(
    "/{model_id}/versions/{version}/predict",
    response_model=PredictionResponse,
)
def predict(
    model_id: int,
    version: str,
    payload: PredictionRequest,
    db: Session = Depends(get_db),
) -> PredictionResponse:
    started_at = perf_counter()
    metrics_key = f"{model_id}:{version}"
    success = False
    prediction: Any = None
    error_detail: str | None = None

    try:
        model = db.get(Model, model_id)
        if model is None:
            error_detail = "Model not found"
            raise HTTPException(status_code=404, detail=error_detail)

        model_version = (
            db.query(ModelVersion)
            .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
            .first()
        )
        if model_version is None:
            error_detail = "Model version not found"
            raise HTTPException(status_code=404, detail=error_detail)
        if model_version.status != "deployed":
            error_detail = "Model version is not deployed"
            raise HTTPException(status_code=409, detail=error_detail)

        if not model_version.artifact_path:
            error_detail = "Model artifact not found"
            raise HTTPException(status_code=404, detail=error_detail)

        try:
            artifact_path = artifact_store.resolve(model_version.artifact_path)
            runtime = runtime_registry.get(model_version.framework)
            loaded_model = runtime.get_or_load(str(artifact_path))
            prediction = runtime.predict(loaded_model, payload.input)
        except FileNotFoundError as exc:
            error_detail = "Model artifact not found"
            raise HTTPException(status_code=404, detail=error_detail) from exc
        except ValueError as exc:
            error_detail = str(exc)
            raise HTTPException(status_code=422, detail=error_detail) from exc
        except (TypeError, SyntaxError) as exc:
            error_detail = str(exc)
            raise HTTPException(status_code=422, detail=error_detail) from exc
        except HTTPException:
            raise
        except Exception as exc:
            error_detail = "Model inference failed"
            raise HTTPException(status_code=500, detail=error_detail) from exc

        success = True
        return PredictionResponse(
            model=model.name,
            version=model_version.version,
            prediction=prediction,
        )
    finally:
        latency_ms = (perf_counter() - started_at) * 1000
        metrics_collector.record(metrics_key, latency_ms, success)
        try:
            record_persistent_metric(
                db,
                model_id,
                version,
                latency_ms,
                success,
                input_text=str(payload.input),
                prediction=None if prediction is None else str(prediction),
                error=error_detail,
            )
        except Exception:
            db.rollback()
