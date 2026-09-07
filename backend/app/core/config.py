from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://modeldock:modeldock@postgres:5432/modeldock"
    frontend_origin: str = "http://localhost:3000"
    max_artifact_size_bytes: int = Field(
        default=50 * 1024 * 1024,
        gt=0,
        description="Maximum accepted model artifact size in bytes",
    )

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MODELDOCK_", extra="ignore")


settings = Settings()
