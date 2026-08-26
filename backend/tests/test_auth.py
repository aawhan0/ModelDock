from fastapi.testclient import TestClient

from app.main import app


def test_protected_routes_require_api_key(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    response = client.get("/api/v1/models")
    assert response.status_code == 401

    response = client.get("/api/v1/models", headers={"Authorization": "Bearer test-admin-key"})
    assert response.status_code == 200


def test_api_key_can_be_created_and_used(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    create_response = client.post(
        "/api/v1/auth/keys",
        json={"name": "integration-test"},
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert create_response.status_code == 201
    raw_key = create_response.json()["key"]
    assert raw_key.startswith("md_")

    response = client.get("/api/v1/models", headers={"Authorization": f"Bearer {raw_key}"})
    assert response.status_code == 200
