from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.metrics import get_inference_history, get_metrics_timeseries, get_persistent_metrics

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/{model_id}/{version}")
def get_metrics(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> dict[str, float | int | str]:
    metrics = get_persistent_metrics(db, model_id, version)
    return {
        "model_id": model_id,
        "version": version,
        "requests": metrics.requests,
        "successful": metrics.successful,
        "failed": metrics.failed,
        "average_latency_ms": round(metrics.average_latency_ms, 3),
    }


@router.get("/{model_id}/{version}/history")
def get_history(
    model_id: int,
    version: str,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    history = get_inference_history(db, model_id, version, limit)
    return [
        {
            "id": item.id,
            "input": item.input_text,
            "prediction": item.prediction,
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
    return get_metrics_timeseries(db, model_id, version, hours)
