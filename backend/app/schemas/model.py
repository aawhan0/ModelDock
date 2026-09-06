from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ModelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    task: str = Field(min_length=1, max_length=100)
    description: str | None = None


class ModelRead(ModelCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ModelVersionCreate(BaseModel):
    version: str = Field(min_length=1, max_length=100)
    artifact_path: str = Field(default="")
    framework: str = Field(min_length=1, max_length=50)


class ModelVersionRead(ModelVersionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    model_id: int
    status: str
    created_at: datetime
