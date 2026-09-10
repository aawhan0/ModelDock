from time import perf_counter
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import require_scope
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore, verify_artifact
from app.services.metrics import (
    get_inference_request,
    metrics_collector,
    record_inference_request,
    record_persistent_metric,
)
from app.services.runtime_registry import runtime_registry

router = APIRouter(
    prefix="/models",
    tags=["inference"],
    dependencies=[Depends(require_scope("inference:execute"))],
)
artifact_store = LocalArtifactStore()


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
    results: list[BatchPredictionItem]


def _resolve_request_id(value: UUID | None) -> UUID:
    return value or uuid4()


@router.post("/{model_id}/versions/{version}/predict", response_model=PredictionResponse)
def predict(
    model_id: int,
    version: str,
    payload: PredictionRequest,
    db: Session = Depends(get_db),
    request_id: UUID | None = Header(default=None, alias="X-Request-ID"),
) -> PredictionResponse:
    request_id = _resolve_request_id(request_id)
    started_at = perf_counter()
    metrics_key = f"{model_id}:{version}"
    success = False
    prediction: Any = None
    error_detail: str | None = None
    metric_id: int | None = None

    existing_request = get_inference_request(db, request_id)
    if existing_request is not None:
        if existing_request.model_id != model_id or existing_request.version != version:
            raise HTTPException(status_code=409, detail="Request ID is already associated with another model version")
        if existing_request.status == "success" and existing_request.prediction_metric_id is not None:
            metric = db.get(__import__("app.models.metric", fromlist=["InferenceMetric"]).InferenceMetric, existing_request.prediction_metric_id)
            if metric is not None:
                return PredictionResponse(
                    model=db.get(Model, model_id).name,
                    version=version,
                    prediction=metric.prediction,
                    prediction_id=metric.id,
                    request_id=request_id,
                    latency_ms=round(existing_request.latency_ms, 3),
                )
        raise HTTPException(status_code=409, detail="Request ID has already been used")

    try:
        model = db.get(Model, model_id)
        if model is None:
            error_detail = "Model not found"
            raise HTTPException(status_code=404, detail=error_detail)
        model_version = db.query(ModelVersion).filter(
            ModelVersion.model_id == model_id, ModelVersion.version == version
        ).first()
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
            if model_version.artifact_sha256 and not verify_artifact(
                artifact_path, model_version.artifact_sha256, model_version.artifact_size_bytes
            ):
                error_detail = "Model artifact integrity check failed"
                raise HTTPException(status_code=409, detail=error_detail)
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
            prediction_id=metric_id or 0,
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
        except Exception:
            db.rollback()


@router.post("/{model_id}/versions/{version}/predict/batch", response_model=BatchPredictionResponse)
def predict_batch(
    model_id: int,
    version: str,
    payload: BatchPredictionRequest,
    db: Session = Depends(get_db),
    request_id: UUID | None = Header(default=None, alias="X-Request-ID"),
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
    results: list[BatchPredictionItem] = []
    started_at = perf_counter()

    for index, item in enumerate(payload.inputs):
        item_request_id = uuid4()
        try:
            response = predict(
                model_id=model_id,
                version=version,
                payload=PredictionRequest(input=item),
                db=db,
                request_id=item_request_id,
            )
            results.append(
                BatchPredictionItem(
                    index=index,
                    success=True,
                    prediction=response.prediction,
                    prediction_id=response.prediction_id,
                    request_id=response.request_id,
                    latency_ms=response.latency_ms,
                )
            )
        except HTTPException as exc:
            results.append(
                BatchPredictionItem(
                    index=index,
                    success=False,
                    request_id=item_request_id,
                    latency_ms=round((perf_counter() - started_at) * 1000, 3),
                    error=str(exc.detail),
                )
            )

    successful = sum(1 for item in results if item.success)
    return BatchPredictionResponse(
        model=model.name,
        version=version,
        request_id=batch_request_id,
        total=len(results),
        successful=successful,
        failed=len(results) - successful,
        results=results,
    )
