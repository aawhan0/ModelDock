from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ModelCreate(BaseModel):
    name: str
    task: str
    description: str | None = None


class ModelRead(ModelCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class ModelVersionCreate(BaseModel):
    version: str
    artifact_path: str
    framework: str


class ModelVersionRead(ModelVersionCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    model_id: int
    created_at: datetime
