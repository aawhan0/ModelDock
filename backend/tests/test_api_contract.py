from app.main import app


def test_public_api_contract_stays_versioned_and_exposes_core_surfaces():
    schema = app.openapi()
    paths = schema["paths"]
    registered_paths = {
        route.path for route in app.routes if hasattr(route, "path")
    }

    assert schema["info"]["title"] == "ModelDock API"
    assert schema["info"]["version"] == "0.1.0"

    assert "/health" in paths
    assert "/ready" in paths
    assert "/metrics" in registered_paths
    assert "/metrics" not in paths

    for path in (
        "/api/v1/models",
        "/api/v1/models/{model_id}/versions/{version}/predict",
        "/api/v1/models/{model_id}/versions/{version}/predict/batch",
        "/api/v1/metrics/requests/{request_id}",
    ):
        assert path in paths

    assert "/api/v2/models" not in paths


def test_inference_contract_documents_request_correlation_and_idempotency_headers():
    schema = app.openapi()
    inference = schema["paths"]["/api/v1/models/{model_id}/versions/{version}/predict"]
    parameters = inference["post"]["parameters"]
    headers = {
        parameter["name"]
        for parameter in parameters
        if parameter.get("in") == "header"
    }

    assert "X-Request-ID" in headers
    assert "Idempotency-Key" in headers
