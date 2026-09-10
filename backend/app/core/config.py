from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://modeldock:modeldock@postgres:5432/modeldock"
    frontend_origin: str = "http://localhost:3000"
    cors_origins: str | None = None
    log_level: str = Field(default="INFO", pattern=r"^(?i:DEBUG|INFO|WARNING|ERROR|CRITICAL)$")
    max_artifact_size_bytes: int = Field(default=50 * 1024 * 1024, gt=0, description="Maximum accepted model artifact size in bytes")
    max_batch_size: int = Field(default=100, gt=0, le=1000, description="Maximum prediction inputs accepted by one batch request")
    rate_limit_enabled: bool = True
    rate_limit_requests: int = Field(default=60, gt=0)
    rate_limit_window_seconds: int = Field(default=60, gt=0)
    rate_limit_redis_url: str = "redis://redis:6379/0"
    rate_limit_fail_open: bool = True
    monitoring_window_hours: int = Field(default=24, gt=0, le=168)
    monitoring_p95_latency_ms: float = Field(default=1000.0, gt=0)
    monitoring_error_rate_threshold: float = Field(default=0.05, ge=0, le=1)
    monitoring_drift_moderate_threshold: float = Field(default=0.1, ge=0)
    monitoring_drift_significant_threshold: float = Field(default=0.2, ge=0)

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MODELDOCK_", extra="ignore")

    @property
    def allowed_cors_origins(self) -> list[str]:
        raw = self.cors_origins or self.frontend_origin
        origins = [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]
        return list(dict.fromkeys(origins))

    @field_validator("cors_origins")
    @classmethod
    def validate_cors_origins(cls, value: str | None) -> str | None:
        if value is None:
            return value
        origins = [origin.strip() for origin in value.split(",") if origin.strip()]
        if not origins:
            raise ValueError("cors_origins must contain at least one origin")
        if "*" in origins:
            raise ValueError("wildcard CORS origins are not supported")
        return ",".join(origins)

    @field_validator("monitoring_drift_significant_threshold")
    @classmethod
    def validate_drift_thresholds(cls, value: float, info):
        moderate = info.data.get("monitoring_drift_moderate_threshold")
        if moderate is not None and value < moderate:
            raise ValueError("monitoring_drift_significant_threshold must be >= monitoring_drift_moderate_threshold")
        return value


settings = Settings()
