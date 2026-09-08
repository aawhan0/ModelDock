import json
import logging

from fastapi import Response
from fastapi.testclient import TestClient

from app.core.logging import JsonFormatter, REQUEST_ID_HEADER, configure_logging
from app.main import create_app


def test_request_id_is_generated_and_returned() -> None:
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    request_id = response.headers[REQUEST_ID_HEADER]
    assert request_id
    assert len(request_id) == 36


def test_valid_request_id_is_preserved() -> None:
    client = TestClient(create_app())

    response = client.get("/health", headers={REQUEST_ID_HEADER: "trace-123"})

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER] == "trace-123"


def test_invalid_request_id_is_replaced() -> None:
    client = TestClient(create_app())

    response = client.get("/health", headers={REQUEST_ID_HEADER: "bad\ntrace"})

    assert response.status_code == 200
    assert response.headers[REQUEST_ID_HEADER] != "bad\ntrace"
    assert len(response.headers[REQUEST_ID_HEADER]) == 36


def test_unhandled_errors_are_sanitized_and_correlated() -> None:
    app = create_app()

    @app.get("/test-observability-error")
    def test_error() -> Response:
        raise RuntimeError("secret internal detail")

    client = TestClient(app, raise_server_exceptions=False)
    response = client.get(
        "/test-observability-error",
        headers={REQUEST_ID_HEADER: "error-trace-1"},
    )

    assert response.status_code == 500
    assert response.headers[REQUEST_ID_HEADER] == "error-trace-1"
    assert response.json() == {
        "error": {
            "code": 500,
            "message": "Internal server error",
            "request_id": "error-trace-1",
        }
    }
    assert "secret internal detail" not in response.text


def test_json_formatter_includes_request_context() -> None:
    record = logging.LogRecord(
        name="modeldock.test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="request completed",
        args=(),
        exc_info=None,
    )
    record.request_id = "trace-123"
    record.method = "GET"
    record.path = "/health"
    record.status_code = 200
    record.duration_ms = 1.25

    payload = json.loads(JsonFormatter().format(record))

    assert payload["request_id"] == "trace-123"
    assert payload["method"] == "GET"
    assert payload["path"] == "/health"
    assert payload["status_code"] == 200
    assert payload["duration_ms"] == 1.25


def test_configure_logging_falls_back_for_invalid_level() -> None:
    root = logging.getLogger()
    configure_logging("not-a-level")

    assert root.level == logging.INFO
    assert root.handlers
