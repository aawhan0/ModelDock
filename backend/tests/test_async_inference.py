import time
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.artifacts import artifact_store as upload_artifact_store
from app.api.inference import artifact_store as inference_artifact_store
from app.api.models import artifact_store as model_artifact_store
from app.core.database import get_db
from app.main import app
from app.models.base import Base


def _client(tmp_path: Path, monkeypatch) -> TestClient:
    engine = create_engine(f"sqlite:///{tmp_path / 'async.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    artifact_root = tmp_path / "artifacts"
    monkeypatch.setattr(upload_artifact_store, "root", artifact_root)
    monkeypatch.setattr(inference_artifact_store, "root", artifact_root)
    monkeypatch.setattr(model_artifact_store, "root", artifact_root)
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    return TestClient(app, headers={"Authorization": "Bearer test-admin-key"})


def _deployed_model(client: TestClient, source: bytes = b"def model(value):\n    return {'echo': value}\n") -> int:
    model = client.post("/api/v1/models", json={"name": "async-model", "task": "test", "description": "async test"})
    assert model.status_code == 201
    model_id = model.json()["id"]
    version = client.post(
        f"/api/v1/models/{model_id}/versions",
        json={"version": "v1", "artifact_path": "", "framework": "python"},
    )
    assert version.status_code == 201
    artifact = client.post(
        f"/api/v1/models/{model_id}/versions/v1/artifact",
        files={"file": ("model.py", source, "text/plain")},
    )
    assert artifact.status_code == 201
    deployed = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
    assert deployed.status_code == 200
    return model_id


def _wait_for_job(client: TestClient, job_id: str) -> dict:
    for _ in range(100):
        response = client.get(f"/api/v1/models/inference-jobs/{job_id}")
        assert response.status_code == 200
        body = response.json()
        if body["status"] in {"completed", "failed"}:
            return body
        time.sleep(0.01)
    raise AssertionError("inference job did not finish")


def test_async_job_completes_and_idempotency_replays_job(tmp_path: Path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    try:
        model_id = _deployed_model(client)
        headers = {"Idempotency-Key": "async-request-1"}
        first = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "hello"},
            headers=headers,
        )
        assert first.status_code == 202
        second = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "hello"},
            headers=headers,
        )
        assert second.status_code == 202
        assert second.json()["job_id"] == first.json()["job_id"]
        conflict = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "different"},
            headers=headers,
        )
        assert conflict.status_code == 409
        result = _wait_for_job(client, first.json()["job_id"])
        assert result["status"] == "completed"
        assert result["result"]["prediction"] == {"echo": "hello"}
    finally:
        app.dependency_overrides.clear()


def test_async_job_failure_is_structured_and_safe(tmp_path: Path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    try:
        model_id = _deployed_model(client, b"def model(value):\n    raise ValueError('bad input')\n")
        response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "hello"},
        )
        assert response.status_code == 202
        result = _wait_for_job(client, response.json()["job_id"])
        assert result["status"] == "failed"
        assert result["error"]["code"] == 422
        assert "hello" not in result["error"]["message"]
        assert "input" not in result["error"]
    finally:
        app.dependency_overrides.clear()


def test_async_submission_rejects_undeployed_versions(tmp_path: Path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    try:
        model = client.post(
            "/api/v1/models",
            json={"name": "undeployed-async-model", "task": "test", "description": "async test"},
        )
        assert model.status_code == 201
        model_id = model.json()["id"]
        version = client.post(
            f"/api/v1/models/{model_id}/versions",
            json={"version": "v1", "artifact_path": "", "framework": "python"},
        )
        assert version.status_code == 201
        response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "hello"},
        )
        assert response.status_code == 409
        assert response.json()["error"]["message"] == "Model version is not deployed"
    finally:
        app.dependency_overrides.clear()