from datetime import datetime

from pydantic import BaseModel


class APIKeyCreate(BaseModel):
    name: str


class APIKeyRead(BaseModel):
    id: int
    name: str
    key_prefix: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class APIKeyCreated(APIKeyRead):
    key: str
