from fastapi.testclient import TestClient

from app.main import create_app


def test_health() -> None:
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_uses_configured_frontend_origin(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_FRONTEND_ORIGIN", "https://dashboard.example.com")

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
\n\ndef test_readiness_returns_service_unavailable_when_database_is_unreachable(monkeypatch) -> None:\n    class BrokenSession:\n        def execute(self, statement):\n            raise RuntimeError("database unavailable")\n\n        def close(self):\n            pass\n\n    monkeypatch.setattr("app.main.SessionLocal", lambda: BrokenSession())\n    response = TestClient(create_app()).get("/ready")\n    assert response.status_code == 503\n    assert response.json() == {"status": "not_ready"}\n