from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    task: str = Field(min_length=1, max_length=100)
    description: str | None = None

    @field_validator("name", "task")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class ModelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    task: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = None

    @field_validator("name", "task")
    @classmethod
    def validate_non_blank(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("must not be blank")
        return value


class ModelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    task: str
    description: str | None = None
    id: int
    created_at: datetime


class ModelVersionCreate(BaseModel):
    version: str = Field(min_length=1, max_length=100)
    artifact_path: str = Field(default="")
    framework: str = Field(min_length=1, max_length=50)

    @field_validator("version", "framework")
    @classmethod
    def validate_non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class ModelVersionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    version: str
    artifact_path: str = ""
    framework: str
    id: int
    model_id: int
    status: str
    created_at: datetime


class DeploymentEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    version: str
    previous_version: str | None = None
    created_at: datetime
