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


def test_protected_routes_are_open_when_auth_is_explicitly_disabled(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")
    client = TestClient(app)

    response = client.get("/api/v1/models")
    assert response.status_code == 200


def test_auth_defaults_to_enabled(monkeypatch) -> None:
    monkeypatch.delenv("MODELDOCK_API_AUTH_ENABLED", raising=False)
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    response = client.get("/api/v1/models")
    assert response.status_code == 401


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
    key_id = create_response.json()["id"]
    assert raw_key.startswith("md_")

    # Argon2 encoded hashes exceed the legacy SHA-256 column width.
    from app.models.api_key import APIKey
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        stored = db.query(APIKey).filter(APIKey.id == key_id).one()
        assert stored.key_hash.startswith("$argon2")
        assert len(stored.key_hash) <= 255
    finally:
        db.close()

    response = client.get("/api/v1/models", headers={"Authorization": f"Bearer {raw_key}"})
    assert response.status_code == 200

    revoke_response = client.delete(
        f"/api/v1/auth/keys/{key_id}",
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert revoke_response.status_code == 204

    response = client.get("/api/v1/models", headers={"Authorization": f"Bearer {raw_key}"})
    assert response.status_code == 401


def test_protected_route_rejects_malformed_bearer_header(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    response = client.get(
        "/api/v1/models",
        headers={"Authorization": "Basic test-admin-key"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["message"] == "Missing API key"


def test_scoped_api_key_cannot_access_model_management(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    create_response = client.post(
        "/api/v1/auth/keys",
        json={"name": "metrics-only", "scopes": ["metrics:read"]},
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert create_response.status_code == 201
    assert create_response.json()["scopes"] == ["metrics:read"]
    raw_key = create_response.json()["key"]

    response = client.get(
        "/api/v1/models",
        headers={"Authorization": f"Bearer {raw_key}"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["message"] == "API key lacks required scope: models:manage"


def test_api_key_scope_validation_rejects_unknown_scope(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    response = client.post(
        "/api/v1/auth/keys",
        json={"name": "invalid", "scopes": ["not-a-real-scope"]},
        headers={"Authorization": "Bearer test-admin-key"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == 422


def test_admin_can_update_api_key_scopes(monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    client = TestClient(app)

    create_response = client.post(
        "/api/v1/auth/keys",
        json={"name": "scope-update"},
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert create_response.status_code == 201
    key_id = create_response.json()["id"]

    response = client.patch(
        f"/api/v1/auth/keys/{key_id}",
        json={"scopes": ["inference:execute"]},
        headers={"Authorization": "Bearer test-admin-key"},
    )
    assert response.status_code == 200
    assert response.json()["scopes"] == ["inference:execute"]
