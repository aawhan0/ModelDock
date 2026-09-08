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

    class FakeRedis:
        async def ping(self):
            return True

    monkeypatch.setattr("app.main.SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(app.state, "rate_limit_redis", FakeRedis())

    client = TestClient(app)

    response = client.get("/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert response.json()["checks"] == {"database": "ok", "redis": "ok"}


def test_ready_endpoint_reports_database_failure(monkeypatch) -> None:
    class FakeSession:
        def execute(self, statement):
            raise RuntimeError("database unavailable")

        def close(self) -> None:
            pass

    monkeypatch.setattr("app.main.SessionLocal", lambda: FakeSession())

    client = TestClient(app)

    response = client.get("/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["checks"]["database"] == "unavailable"


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


def test_prometheus_metrics_endpoint_is_reachable_without_auth(tmp_path, monkeypatch) -> None:
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.models.base import Base

    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'metrics_endpoint.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    SessionTesting = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    monkeypatch.setattr("app.main.SessionLocal", SessionTesting)

    client = TestClient(app)
    response = client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    assert "modeldock_models_total 0" in response.text
    assert "modeldock_inference_requests_total" in response.text


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


def test_request_id_is_returned_and_invalid_client_id_is_replaced() -> None:
    client = TestClient(app)
    response = client.get("/health", headers={"X-Request-ID": "bad id with spaces"})

    assert response.status_code == 200
    request_id = response.headers.get("X-Request-ID")
    assert request_id
    assert request_id != "bad id with spaces"


def test_valid_request_id_is_preserved() -> None:
    client = TestClient(app)
    response = client.get("/health", headers={"X-Request-ID": "trace-123"})

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "trace-123"


def test_security_headers_are_present() -> None:
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "no-referrer"
    assert response.headers["Permissions-Policy"] == (
        "camera=(), microphone=(), geolocation=(), payment=()"
    )
    assert response.headers["Content-Security-Policy"] == (
        "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    )


def test_ready_endpoint_reports_redis_failure(monkeypatch) -> None:
    class FakeSession:
        def execute(self, statement):
            return None

        def close(self) -> None:
            pass

    class FakeRedis:
        async def ping(self):
            raise RuntimeError("redis unavailable")

    monkeypatch.setattr("app.main.SessionLocal", lambda: FakeSession())
    monkeypatch.setattr(app.state, "rate_limit_redis", FakeRedis())

    response = TestClient(app).get("/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "not_ready"
    assert response.json()["checks"]["redis"] == "unavailable"
