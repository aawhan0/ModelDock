from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock

from sqlalchemy import Integer, func
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
    input_text: str = "",
    prediction: str | None = None,
) -> None:
    db.add(
        InferenceMetric(
            model_id=model_id,
            version=version,
            input_text=input_text,
            prediction=prediction,
            latency_ms=latency_ms,
            success=success,
        )
    )
    db.commit()


def get_persistent_metrics(db: Session, model_id: int, version: str) -> RuntimeMetrics:
    requests, successful, total_latency = db.query(
        func.count(InferenceMetric.id),
        func.coalesce(func.sum(InferenceMetric.success.cast(Integer)), 0),
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


def get_inference_history(
    db: Session,
    model_id: int,
    version: str,
    limit: int = 50,
) -> list[InferenceMetric]:
    return (
        db.query(InferenceMetric)
        .filter(
            InferenceMetric.model_id == model_id,
            InferenceMetric.version == version,
        )
        .order_by(InferenceMetric.created_at.desc(), InferenceMetric.id.desc())
        .limit(limit)
        .all()
    )


def get_metrics_timeseries(
    db: Session,
    model_id: int,
    version: str,
    hours: int = 24,
) -> list[dict[str, object]]:
    """Return hourly request/latency aggregates for the requested window."""
    now = datetime.now(timezone.utc)
    start = now - timedelta(hours=hours)
    rows = (
        db.query(InferenceMetric)
        .filter(
            InferenceMetric.model_id == model_id,
            InferenceMetric.version == version,
            InferenceMetric.created_at >= start,
        )
        .order_by(InferenceMetric.created_at.asc(), InferenceMetric.id.asc())
        .all()
    )

    buckets: dict[datetime, dict[str, float | int]] = {}
    for index in range(hours):
        bucket = (start + timedelta(hours=index)).replace(minute=0, second=0, microsecond=0)
        buckets[bucket] = {"requests": 0, "successful": 0, "failed": 0, "total_latency_ms": 0.0}

    for row in rows:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        bucket = created.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
        if bucket not in buckets:
            continue
        bucket_data = buckets[bucket]
        bucket_data["requests"] += 1
        bucket_data["successful"] += int(row.success)
        bucket_data["failed"] += int(not row.success)
        bucket_data["total_latency_ms"] += row.latency_ms

    return [
        {
            "timestamp": bucket,
            "requests": int(data["requests"]),
            "successful": int(data["successful"]),
            "failed": int(data["failed"]),
            "average_latency_ms": round(
                float(data["total_latency_ms"]) / int(data["requests"]), 3
            ) if data["requests"] else 0.0,
        }
        for bucket, data in buckets.items()
    ]
