from dataclasses import dataclass
from threading import Lock

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.metric import InferenceMetric


@dataclass
class RuntimeMetrics:
    requests: int = 0
    successful: int = 0
    failed: int = 0
    total_latency_ms: float = 0.0

    @property
    def average_latency_ms(self) -> float:
        if self.requests == 0:
            return 0.0
        return self.total_latency_ms / self.requests


class MetricsCollector:
    """In-memory collector retained for fast local access and compatibility."""

    def __init__(self) -> None:
        self._metrics: dict[str, RuntimeMetrics] = {}
        self._lock = Lock()

    def record(self, key: str, latency_ms: float, success: bool) -> None:
        with self._lock:
            metrics = self._metrics.setdefault(key, RuntimeMetrics())
            metrics.requests += 1
            metrics.total_latency_ms += latency_ms
            if success:
                metrics.successful += 1
            else:
                metrics.failed += 1

    def get(self, key: str) -> RuntimeMetrics:
        with self._lock:
            metrics = self._metrics.get(key, RuntimeMetrics())
            return RuntimeMetrics(
                requests=metrics.requests,
                successful=metrics.successful,
                failed=metrics.failed,
                total_latency_ms=metrics.total_latency_ms,
            )

    def clear(self) -> None:
        with self._lock:
            self._metrics.clear()


metrics_collector = MetricsCollector()


def record_persistent_metric(
    db: Session,
    model_id: int,
    version: str,
    latency_ms: float,
    success: bool,
) -> None:
    db.add(
        InferenceMetric(
            model_id=model_id,
            version=version,
            latency_ms=latency_ms,
            success=success,
        )
    )
    db.commit()


def get_persistent_metrics(db: Session, model_id: int, version: str) -> RuntimeMetrics:
    requests, successful, total_latency = db.query(
        func.count(InferenceMetric.id),
        func.coalesce(func.sum(func.cast(InferenceMetric.success, int)), 0),
        func.coalesce(func.sum(InferenceMetric.latency_ms), 0.0),
    ).filter(
        InferenceMetric.model_id == model_id,
        InferenceMetric.version == version,
    ).one()

    requests = int(requests or 0)
    successful = int(successful or 0)
    total_latency = float(total_latency or 0.0)

    return RuntimeMetrics(
        requests=requests,
        successful=successful,
        failed=requests - successful,
        total_latency_ms=total_latency,
    )
