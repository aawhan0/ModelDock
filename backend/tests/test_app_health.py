from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_is_process_health() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ready_endpoint_reports_database_readiness(monkeypatch) -> None:
    class FakeResult:
        def __call__(self, statement):
            assert statement.text == "SELECT 1"

    class FakeSession:
        def execute(self, statement):
            return FakeResult()(statement)

        def close(self) -> None:
            pass

    monkeypatch.setattr("app.main.SessionLocal", lambda: FakeSession())

    client = TestClient(app)

    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_ready_endpoint_reports_database_failure(monkeypatch) -> None:
    class FakeSession:
        def execute(self, statement):
            raise RuntimeError("database unavailable")

        def close(self) -> None:
            pass

    monkeypatch.setattr("app.main.SessionLocal", lambda: FakeSession())

    client = TestClient(app)

    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json() == {"status": "not_ready"}


def test_http_errors_use_unified_error_shape(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    client = TestClient(app)
    response = client.get(
        "/api/v1/models/999999",
        headers={"Authorization": "Bearer test-admin-key"},
    )

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": 404,
            "message": "Model not found",
        }
    }


def test_validation_errors_use_unified_error_shape(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")

    client = TestClient(app)
    response = client.post(
        "/api/v1/models",
        json={"name": "missing-task"},
    )

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == 422
    assert body["error"]["message"] == "Request validation failed"
    assert body["error"]["details"]
