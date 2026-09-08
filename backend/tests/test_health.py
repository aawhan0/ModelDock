from fastapi.testclient import TestClient

from app.main import create_app


def test_health() -> None:
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_uses_configured_frontend_origin(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "frontend_origin", "https://dashboard.example.com")

    response = TestClient(create_app()).options(
        "/api/v1/models",
        headers={
            "Origin": "https://dashboard.example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://dashboard.example.com"


def test_cors_rejects_unconfigured_frontend_origin(monkeypatch) -> None:
    response = TestClient(create_app()).options(
        "/api/v1/models",
        headers={
            "Origin": "https://malicious.example.com",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 400


def test_default_frontend_origin_is_local_development_origin() -> None:
    from app.core.config import settings

    assert settings.frontend_origin == "http://localhost:3000"


def test_readiness_returns_service_unavailable_when_database_is_unreachable(monkeypatch) -> None:
    class BrokenSession:
        def execute(self, statement):
            raise RuntimeError("database unavailable")

        def close(self):
            pass

    class FakeRedis:
        async def ping(self):
            return True

    monkeypatch.setattr("app.main.SessionLocal", lambda: BrokenSession())
    app = create_app(redis_client=FakeRedis())
    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "not_ready",
        "checks": {"database": "unavailable", "redis": "ok"},
    }

def test_invalid_artifact_size_configuration_is_rejected(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_MAX_ARTIFACT_SIZE_BYTES", "0")

    from pydantic import ValidationError

    from app.core.config import Settings

    try:
        Settings()
    except ValidationError as exc:
        assert "max_artifact_size_bytes" in str(exc)
    else:
        raise AssertionError("Expected invalid artifact size configuration to fail")
