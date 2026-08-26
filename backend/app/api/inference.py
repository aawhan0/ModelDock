from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore
from app.services.metrics import metrics_collector, record_persistent_metric
from app.services.runtime_registry import RuntimeRegistry

router = APIRouter(prefix="/models", tags=["inference"])
artifact_store = LocalArtifactStore()
runtime_registry = RuntimeRegistry()


class PredictionRequest(BaseModel):
    input: Any


class PredictionResponse(BaseModel):
    model: str
    version: str
    prediction: Any


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

    try:
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
        if not model_version.artifact_path:
            raise HTTPException(status_code=404, detail="Model artifact not found")

        try:
            artifact_path = artifact_store.resolve(model_version.artifact_path)
            runtime = runtime_registry.get(model_version.framework)
            loaded_model = runtime.get_or_load(str(artifact_path))
            prediction = runtime.predict(loaded_model, payload.input)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail="Model artifact not found") from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except (TypeError, SyntaxError) as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=500, detail="Model inference failed") from exc

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
            record_persistent_metric(db, model_id, version, latency_ms, success)
        except Exception:
            db.rollback()
