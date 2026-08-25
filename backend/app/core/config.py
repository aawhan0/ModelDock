from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://modeldock:modeldock@postgres:5432/modeldock"

    model_config = SettingsConfigDict(env_file=".env", env_prefix="MODELDOCK_", extra="ignore")


settings = Settings()
