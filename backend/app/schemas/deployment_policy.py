from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DeploymentPolicyUpsert(BaseModel):
    enabled: bool = True
    minimum_metrics: dict[str, float] = Field(min_length=1, max_length=20)

    @field_validator("minimum_metrics")
    @classmethod
    def validate_metrics(cls, value: dict[str, float]) -> dict[str, float]:
        for name, threshold in value.items():
            if not name.strip():
                raise ValueError("metric names must not be blank")
            if not isinstance(threshold, (int, float)) or isinstance(threshold, bool):
                raise ValueError("metric thresholds must be numeric")
        return {name.strip(): threshold for name, threshold in value.items()}


class DeploymentPolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    model_id: int
    enabled: bool
    minimum_metrics: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class DeploymentReadiness(BaseModel):
    model_id: int
    version: str
    allowed: bool
    policy_enabled: bool
    run_id: int | None = None
    metrics: dict[str, Any]
    failures: list[str]
