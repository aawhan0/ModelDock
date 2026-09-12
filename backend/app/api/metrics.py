from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_scope
from app.models.model import Model, ModelVersion
from app.services.drift import compute_drift
from app.services.metrics import (
    compare_versions,
    get_inference_history,
    get_inference_request,
    get_metrics_timeseries,
    get_monitoring_summary,
    get_persistent_metrics,
    get_prediction_distribution,
)

router = APIRouter(
    prefix="/metrics",
    tags=["metrics"],
    dependencies=[Depends(require_scope("metrics:read"))],
)


def _ensure_model_version(db: Session, model_id: int, version: str) -> None:
    if db.get(Model, model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")
    exists = (
        db.query(ModelVersion.id)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if exists is None:
        raise HTTPException(status_code=404, detail="Model version not found")


@router.get("/requests/{request_id}")
def get_request(
    request_id: UUID,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    request = get_inference_request(db, request_id)
    if request is None:
        raise HTTPException(status_code=404, detail="Inference request not found")
    return {
        "request_id": request.request_id,
        "model_id": request.model_id,
        "version": request.version,
        "endpoint": request.endpoint,
        "status": request.status,
        "prediction_metric_id": request.prediction_metric_id,
        "error": request.error,
        "latency_ms": round(request.latency_ms, 3),
        "created_at": request.created_at,
    }


@router.get("/{model_id}/compare")
def get_version_comparison(
    model_id: int,
    baseline: str = Query(min_length=1, max_length=50),
    candidate: str = Query(min_length=1, max_length=50),
    hours: int | None = Query(default=None, ge=1, le=168),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _ensure_model_version(db, model_id, baseline)
    _ensure_model_version(db, model_id, candidate)
    return compare_versions(db, model_id, baseline, candidate, hours)


@router.get("/{model_id}/{version}")
def get_metrics(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> dict[str, float | int | str]:
    _ensure_model_version(db, model_id, version)
    metrics = get_persistent_metrics(db, model_id, version)
    return {
        "model_id": model_id,
        "version": version,
        "requests": metrics.requests,
        "successful": metrics.successful,
        "failed": metrics.failed,
        "average_latency_ms": round(metrics.average_latency_ms, 3),
    }


@router.get("/{model_id}/{version}/monitoring")
def get_monitoring(
    model_id: int,
    version: str,
    hours: int | None = Query(default=None, ge=1, le=168),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _ensure_model_version(db, model_id, version)
    return get_monitoring_summary(db, model_id, version, hours)


@router.get("/{model_id}/{version}/predictions")
def get_predictions(
    model_id: int,
    version: str,
    hours: int | None = Query(default=None, ge=1, le=168),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _ensure_model_version(db, model_id, version)
    return get_prediction_distribution(db, model_id, version, hours, limit)


@router.get("/{model_id}/{version}/history")
def get_history(
    model_id: int,
    version: str,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    _ensure_model_version(db, model_id, version)
    history = get_inference_history(db, model_id, version, limit)
    return [
        {
            "id": item.id,
            "input": item.input_text,
            "prediction": item.prediction,
            "error": item.error,
            "success": item.success,
            "latency_ms": round(item.latency_ms, 3),
            "created_at": item.created_at,
        }
        for item in history
    ]


@router.get("/{model_id}/{version}/timeseries")
def get_timeseries(
    model_id: int,
    version: str,
    hours: int = Query(default=24, ge=1, le=168),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    _ensure_model_version(db, model_id, version)
    return get_metrics_timeseries(db, model_id, version, hours)


@router.get("/{model_id}/{version}/drift")
def get_drift(
    model_id: int,
    version: str,
    reference_size: int = Query(default=50, ge=5, le=500),
    window_size: int = Query(default=50, ge=5, le=500),
    db: Session = Depends(get_db),
) -> dict[str, object]:
    _ensure_model_version(db, model_id, version)
    return compute_drift(db, model_id, version, reference_size, window_size)
