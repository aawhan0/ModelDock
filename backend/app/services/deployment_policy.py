from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.deployment_policy import DeploymentPolicy
from app.models.experiment import ExperimentRun
from app.models.model import ModelVersion


@dataclass(frozen=True)
class DeploymentGateResult:
    allowed: bool
    policy_enabled: bool
    run_id: int | None
    metrics: dict[str, Any]
    failures: list[str]


def evaluate_deployment_policy(
    db: Session,
    model_version: ModelVersion,
) -> DeploymentGateResult:
    policy = db.scalar(
        select(DeploymentPolicy).where(DeploymentPolicy.model_id == model_version.model_id)
    )
    if policy is None or not policy.enabled:
        return DeploymentGateResult(True, False, None, {}, [])

    run = db.scalar(
        select(ExperimentRun)
        .where(
            ExperimentRun.model_version_id == model_version.id,
            ExperimentRun.status == "completed",
        )
        .order_by(ExperimentRun.id.desc())
    )
    if run is None:
        return DeploymentGateResult(
            False,
            True,
            None,
            {},
            ["No completed evaluation run is linked to this model version"],
        )

    metrics = run.metrics or {}
    failures: list[str] = []
    for metric, minimum in policy.minimum_metrics.items():
        value = metrics.get(metric)
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            failures.append(f"Metric '{metric}' is missing or non-numeric")
            continue
        if value < minimum:
            failures.append(f"Metric '{metric}' is {value}, below required minimum {minimum}")

    return DeploymentGateResult(
        not failures,
        True,
        run.id,
        metrics,
        failures,
    )
