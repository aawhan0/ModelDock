from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.model import Model, ModelVersion
from app.services.metrics import get_persistent_metrics


def _escape_label_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


def _labels(model_id: int, version: str) -> str:
    return f'model_id="{model_id}",version="{_escape_label_value(version)}"'


def render_prometheus_metrics(db: Session) -> str:
    model_count = db.scalar(select(func.count(Model.id))) or 0
    deployed_count = (
        db.scalar(
            select(func.count(ModelVersion.id)).where(ModelVersion.status == "deployed")
        )
        or 0
    )

    versions = (
        db.query(ModelVersion.model_id, ModelVersion.version)
        .order_by(ModelVersion.model_id, ModelVersion.version)
        .all()
    )
    per_version_metrics = [
        (model_id, version, get_persistent_metrics(db, model_id, version))
        for model_id, version in versions
    ]

    lines = [
        "# HELP modeldock_models_total Total number of registered models.",
        "# TYPE modeldock_models_total gauge",
        f"modeldock_models_total {model_count}",
        "# HELP modeldock_deployed_versions_total Number of model versions currently deployed.",
        "# TYPE modeldock_deployed_versions_total gauge",
        f"modeldock_deployed_versions_total {deployed_count}",
        "# HELP modeldock_inference_requests_total Inference requests processed, by outcome.",
        "# TYPE modeldock_inference_requests_total counter",
    ]

    for model_id, version, metrics in per_version_metrics:
        labels = _labels(model_id, version)
        lines.append(f'modeldock_inference_requests_total{{{labels},status="success"}} {metrics.successful}')
        lines.append(f'modeldock_inference_requests_total{{{labels},status="failure"}} {metrics.failed}')

    lines.append("# HELP modeldock_inference_latency_ms Inference latency in milliseconds.")
    lines.append("# TYPE modeldock_inference_latency_ms summary")

    for model_id, version, metrics in per_version_metrics:
        labels = _labels(model_id, version)
        lines.append(f"modeldock_inference_latency_ms_sum{{{labels}}} {metrics.total_latency_ms}")
        lines.append(f"modeldock_inference_latency_ms_count{{{labels}}} {metrics.requests}")

    return "\n".join(lines) + "\n"
