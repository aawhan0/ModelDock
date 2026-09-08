from datetime import datetime

from app.core.security import FULL_API_KEY_SCOPES

from pydantic import BaseModel, Field, field_validator


class APIKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    scopes: list[str] = Field(default_factory=lambda: list(FULL_API_KEY_SCOPES), min_length=1)

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("scopes must not contain duplicates")
        unknown = sorted(set(value) - set(FULL_API_KEY_SCOPES))
        if unknown:
            raise ValueError(f"unknown API key scopes: {', '.join(unknown)}")
        return value

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value


class APIKeyUpdate(BaseModel):
    scopes: list[str] = Field(min_length=1)

    @field_validator("scopes")
    @classmethod
    def validate_scopes(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("scopes must not contain duplicates")
        unknown = sorted(set(value) - set(FULL_API_KEY_SCOPES))
        if unknown:
            raise ValueError(f"unknown API key scopes: {', '.join(unknown)}")
        return value


class APIKeyRead(BaseModel):
    id: int
    name: str
    key_prefix: str
    scopes: list[str]
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class APIKeyCreated(APIKeyRead):
    key: str
