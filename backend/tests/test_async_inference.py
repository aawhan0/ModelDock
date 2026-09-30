from time import monotonic, sleep

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.artifacts import artifact_store as upload_artifact_store
from app.api.inference import artifact_store as inference_artifact_store
from app.api.models import artifact_store as model_artifact_store
from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.services import async_jobs


def _client(tmp_path, monkeypatch) -> TestClient:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")
    engine = create_engine(
        f"sqlite:///{tmp_path / 'async.db'}",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = sessions()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    artifact_root = tmp_path / "artifacts"
    for store in (upload_artifact_store, inference_artifact_store, model_artifact_store, async_jobs.artifact_store):
        monkeypatch.setattr(store, "root", artifact_root)
    return TestClient(app)


def _wait_for_job(client: TestClient, job_id: str) -> dict:
    deadline = monotonic() + 5
    while monotonic() < deadline:
        response = client.get(f"/api/v1/inference-jobs/{job_id}")
        assert response.status_code == 200
        body = response.json()
        if body["status"] in {"completed", "failed"}:
            return body
        sleep(0.02)
    raise AssertionError("inference job did not finish")


def _create_deployed_json_model(client: TestClient, name: str) -> int:
    model = client.post("/api/v1/models", json={"name": name, "task": "classification"})
    assert model.status_code == 201
    model_id = model.json()["id"]
    version = client.post(
        f"/api/v1/models/{model_id}/versions",
        json={"version": "v1", "artifact_path": "", "framework": "json"},
    )
    assert version.status_code == 201
    upload = client.post(
        f"/api/v1/models/{model_id}/versions/v1/artifact",
        files={"file": ("model.json", b'{"predictions":{"hello":"positive"}}', "application/json")},
    )
    assert upload.status_code == 201
    deploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
    assert deploy.status_code == 200
    return model_id


def test_async_inference_completes_and_is_idempotent(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    try:
        model_id = _create_deployed_json_model(client, "async-success")
        headers = {"Idempotency-Key": "request-1"}
        first = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "hello"},
            headers=headers,
        )
        assert first.status_code == 202
        job_id = first.json()["id"]
        assert "input" not in first.json()

        retry = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "hello"},
            headers=headers,
        )
        assert retry.status_code == 202
        assert retry.json()["id"] == job_id

        completed = _wait_for_job(client, job_id)
        assert completed["status"] == "completed"
        assert completed["prediction"] == "positive"
        assert completed["error"] is None
    finally:
        app.dependency_overrides.clear()


def test_async_inference_persists_safe_failure(tmp_path, monkeypatch) -> None:
    client = _client(tmp_path, monkeypatch)
    try:
        model_id = _create_deployed_json_model(client, "async-failure")
        submitted = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/async",
            json={"input": "unknown"},
        )
        assert submitted.status_code == 202
        failed = _wait_for_job(client, submitted.json()["id"])
        assert failed["status"] == "failed"
        assert failed["error"]
        assert failed["prediction"] is None
    finally:
        app.dependency_overrides.clear()