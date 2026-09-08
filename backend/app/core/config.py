from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://modeldock:modeldock@postgres:5432/modeldock"
    frontend_origin: str = "http://localhost:3000"
    log_level: str = Field(default="INFO", pattern=r"^(?i:DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    max_artifact_size_bytes: int = Field(
        default=50 * 1024 * 1024,
        gt=0,
        description="Maximum accepted model artifact size in bytes",
    )
    rate_limit_enabled: bool = True
    rate_limit_requests: int = Field(default=60, gt=0)
    rate_limit_window_seconds: int = Field(default=60, gt=0)
    rate_limit_redis_url: str = "redis://redis:6379/0"
    rate_limit_fail_open: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MODELDOCK_", extra="ignore")


settings = Settings()
