from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.metrics import get_persistent_metrics

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
