from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from uuid import UUID

from sqlalchemy import Integer, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.inference_request import InferenceRequest
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
            metrics.total_latency_ms += max(0.0, latency_ms)
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
    error: str | None = None,
) -> int:
    metric = InferenceMetric(
        model_id=model_id,
        version=version,
        input_text=input_text,
        prediction=prediction,
        error=error,
        latency_ms=max(0.0, latency_ms),
        success=success,
    )
    db.add(metric)
    db.commit()
    db.refresh(metric)
    return metric.id


def record_inference_request(
    db: Session,
    request_id: UUID,
    model_id: int,
    version: str,
    endpoint: str,
    status: str,
    latency_ms: float,
    prediction_metric_id: int | None = None,
    error: str | None = None,
) -> None:
    request = InferenceRequest(
        request_id=request_id,
        model_id=model_id,
        version=version,
        endpoint=endpoint,
        status=status,
        prediction_metric_id=prediction_metric_id,
        error=error,
        latency_ms=max(0.0, latency_ms),
    )
    db.add(request)
    db.commit()


def get_inference_request(db: Session, request_id: UUID) -> InferenceRequest | None:
    return db.query(InferenceRequest).filter(InferenceRequest.request_id == request_id).first()


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
    total_latency = max(0.0, float(total_latency or 0.0))

    return RuntimeMetrics(
        requests=requests,
        successful=successful,
        failed=max(0, requests - successful),
        total_latency_ms=total_latency,
    )


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * percentile
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    fraction = index - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def _window_start(hours: int) -> datetime:
    hours = max(1, min(hours, 168))
    return datetime.now(timezone.utc) - timedelta(hours=hours)


def get_monitoring_summary(
    db: Session,
    model_id: int,
    version: str,
    hours: int | None = None,
) -> dict[str, object]:
    hours = hours or settings.monitoring_window_hours
    start = _window_start(hours)
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

    latencies = [max(0.0, float(row.latency_ms)) for row in rows]
    requests = len(rows)
    successful = sum(bool(row.success) for row in rows)
    failed = requests - successful
    error_rate = failed / requests if requests else 0.0
    window_minutes = max(hours * 60, 1)

    alerts: list[str] = []
    if error_rate >= settings.monitoring_error_rate_threshold and requests:
        alerts.append("error_rate")
    if _percentile(latencies, 0.95) >= settings.monitoring_p95_latency_ms and requests:
        alerts.append("p95_latency")

    return {
        "model_id": model_id,
        "version": version,
        "window_hours": hours,
        "requests": requests,
        "successful": successful,
        "failed": failed,
        "success_rate": round(successful / requests, 4) if requests else 0.0,
        "error_rate": round(error_rate, 4),
        "average_latency_ms": round(sum(latencies) / requests, 3) if requests else 0.0,
        "p50_latency_ms": round(_percentile(latencies, 0.50), 3),
        "p95_latency_ms": round(_percentile(latencies, 0.95), 3),
        "p99_latency_ms": round(_percentile(latencies, 0.99), 3),
        "throughput_requests_per_minute": round(requests / window_minutes, 4),
        "alerts": alerts,
        "healthy": not alerts,
    }


def get_prediction_distribution(
    db: Session,
    model_id: int,
    version: str,
    hours: int | None = None,
    limit: int = 50,
) -> dict[str, object]:
    hours = hours or settings.monitoring_window_hours
    start = _window_start(hours)
    rows = (
        db.query(InferenceMetric.prediction)
        .filter(
            InferenceMetric.model_id == model_id,
            InferenceMetric.version == version,
            InferenceMetric.created_at >= start,
            InferenceMetric.success.is_(True),
            InferenceMetric.prediction.is_not(None),
        )
        .all()
    )
    counts: dict[str, int] = {}
    for (prediction,) in rows:
        key = str(prediction)
        counts[key] = counts.get(key, 0) + 1
    total = sum(counts.values())
    items = [
        {
            "prediction": prediction,
            "count": count,
            "share": round(count / total, 4) if total else 0.0,
        }
        for prediction, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[: max(1, min(limit, 100))]
    ]
    return {
        "model_id": model_id,
        "version": version,
        "window_hours": hours,
        "total_predictions": total,
        "unique_predictions": len(counts),
        "distribution": items,
    }


def compare_versions(
    db: Session,
    model_id: int,
    baseline_version: str,
    candidate_version: str,
    hours: int | None = None,
) -> dict[str, object]:
    baseline = get_monitoring_summary(db, model_id, baseline_version, hours)
    candidate = get_monitoring_summary(db, model_id, candidate_version, hours)

    def delta(key: str) -> float:
        return round(float(candidate[key]) - float(baseline[key]), 4)

    return {
        "model_id": model_id,
        "window_hours": baseline["window_hours"],
        "baseline": baseline,
        "candidate": candidate,
        "delta": {
            "success_rate": delta("success_rate"),
            "error_rate": delta("error_rate"),
            "average_latency_ms": delta("average_latency_ms"),
            "p95_latency_ms": delta("p95_latency_ms"),
            "p99_latency_ms": delta("p99_latency_ms"),
            "throughput_requests_per_minute": delta("throughput_requests_per_minute"),
        },
    }


def get_inference_history(
    db: Session,
    model_id: int,
    version: str,
    limit: int = 50,
) -> list[InferenceMetric]:
    limit = max(1, min(limit, 500))
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
    hours = max(1, min(hours, 168))
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
    first_bucket = start.replace(minute=0, second=0, microsecond=0)
    last_bucket = now.replace(minute=0, second=0, microsecond=0)
    bucket = first_bucket

    while bucket <= last_bucket:
        buckets[bucket] = {"requests": 0, "successful": 0, "failed": 0, "total_latency_ms": 0.0}
        bucket += timedelta(hours=1)

    for row in rows:
        created = row.created_at
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
        bucket = created.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
        if bucket not in buckets:
            continue
        bucket_data = buckets[bucket]
        bucket_data["requests"] += 1
        bucket_data["successful"] += int(bool(row.success))
        bucket_data["failed"] += int(not row.success)
        bucket_data["total_latency_ms"] += max(0.0, float(row.latency_ms))

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
