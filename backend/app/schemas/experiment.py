from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ExperimentStatus = Literal["planned", "running", "completed", "failed", "cancelled"]
RunStatus = Literal["queued", "running", "completed", "failed", "cancelled"]


def _validate_non_blank(value: str) -> str:
    if not value.strip():
        raise ValueError("must not be blank")
    return value


class DatasetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    version: str = Field(min_length=1, max_length=100)
    uri: str | None = Field(default=None, max_length=500)
    description: str | None = None

    _validate_name = field_validator("name", "version")(_validate_non_blank)


class DatasetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    version: str
    uri: str | None = None
    description: str | None = None
    created_at: datetime


class ExperimentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    status: ExperimentStatus = "planned"
    description: str | None = None

    _validate_name = field_validator("name")(_validate_non_blank)


class ExperimentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: ExperimentStatus | None = None
    description: str | None = None

    _validate_name = field_validator("name")(_validate_non_blank)


class ExperimentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: ExperimentStatus
    description: str | None = None
    created_at: datetime
    updated_at: datetime


class ExperimentRunCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    status: RunStatus = "queued"
    model_version_id: int | None = Field(default=None, gt=0)
    dataset_id: int | None = Field(default=None, gt=0)
    parameters: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    started_at: datetime | None = None
    completed_at: datetime | None = None

    _validate_name = field_validator("name")(_validate_non_blank)


class ExperimentRunUpdate(BaseModel):
    status: RunStatus | None = None
    model_version_id: int | None = Field(default=None, gt=0)
    dataset_id: int | None = Field(default=None, gt=0)
    parameters: dict[str, Any] | None = None
    metrics: dict[str, Any] | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ExperimentRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    experiment_id: int
    model_version_id: int | None = None
    dataset_id: int | None = None
    name: str
    status: RunStatus
    parameters: dict[str, Any]
    metrics: dict[str, Any]
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime


class LineageRunRead(ExperimentRunRead):
    dataset: DatasetRead | None = None


class LineageExperimentRead(ExperimentRead):
    runs: list[LineageRunRead]


class ModelVersionLineageRead(BaseModel):
    model_id: int
    version: str
    experiments: list[LineageExperimentRead]
