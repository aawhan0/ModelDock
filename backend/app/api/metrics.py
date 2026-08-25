from fastapi import APIRouter

from app.services.metrics import metrics_collector

router = APIRouter(prefix="/metrics", tags=["metrics"])


@router.get("/{model_id}/{version}")
def get_metrics(model_id: int, version: str) -> dict[str, float | int | str]:
    metrics = metrics_collector.get(f"{model_id}:{version}")
    return {
        "model_id": model_id,
        "version": version,
        "requests": metrics.requests,
        "successful": metrics.successful,
        "failed": metrics.failed,
        "average_latency_ms": round(metrics.average_latency_ms, 3),
    }
