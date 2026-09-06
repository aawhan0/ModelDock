from fastapi.testclient import TestClient

from app.main import app


def test_health() -> None:
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_cors_uses_configured_frontend_origin(monkeypatch) -> None:
    monkeypatch.setattr("app.main.settings.frontend_origin", "https://dashboard.example.com")

    response = TestClient(app).options(
        "/api/v1/models",
        headers={
            "Origin": "https://dashboard.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://dashboard.example.com"


def test_cors_rejects_unconfigured_frontend_origin(monkeypatch) -> None:
    monkeypatch.setattr("app.main.settings.frontend_origin", "https://dashboard.example.com")

    response = TestClient(app).options(
        "/api/v1/models",
        headers={
            "Origin": "https://malicious.example.com",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 400
