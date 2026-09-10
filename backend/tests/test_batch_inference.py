from pathlib import Path
from uuid import UUID

import joblib
from fastapi.testclient import TestClient
from sklearn.base import BaseEstimator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.artifacts import artifact_store as upload_artifact_store
from app.api.inference import artifact_store as inference_artifact_store
from app.api.models import artifact_store as model_artifact_store
from app.core.database import get_db
from app.main import app
from app.models.base import Base


class BatchClassifier(BaseEstimator):
    def predict(self, values: list[str]) -> list[str]:
        return ["positive" if "good" in value.lower() else "negative" for value in values]


def _client(tmp_path: Path, monkeypatch) -> tuple[TestClient, int]:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    engine = create_engine(f"sqlite:///{tmp_path / 'batch.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionTesting = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = SessionTesting()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    artifact_root = tmp_path / "artifacts"
    upload_artifact_store.root = artifact_root
    inference_artifact_store.root = artifact_root
    model_artifact_store.root = artifact_root
    artifact_file = tmp_path / "model.joblib"
    joblib.dump(BatchClassifier(), artifact_file)
    client = TestClient(app, headers={"Authorization": "Bearer test-admin-key"})
    model_id = client.post(
        "/api/v1/models",
        json={"name": "batch-classifier", "task": "classification", "description": "batch test"},
    ).json()["id"]
    assert client.post(
        f"/api/v1/models/{model_id}/versions",
        json={"version": "v1", "artifact_path": "", "framework": "sklearn"},
    ).status_code == 201
    with artifact_file.open("rb") as handle:
        assert client.post(
            f"/api/v1/models/{model_id}/versions/v1/artifact",
            files={"file": ("model.joblib", handle, "application/octet-stream")},
        ).status_code == 201
    deploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
    assert deploy.status_code == 200, deploy.text
    return client, model_id


def test_batch_prediction_returns_ordered_results_and_metrics(tmp_path: Path, monkeypatch) -> None:
    client, model_id = _client(tmp_path, monkeypatch)
    try:
        response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/batch",
            json={"inputs": ["good model", "bad model", "very good model"]},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["model"] == "batch-classifier"
        assert body["version"] == "v1"
        assert UUID(body["request_id"])
        assert body["total"] == 3
        assert body["successful"] == 3
        assert body["failed"] == 0
        assert body["latency_ms"] >= 0
        assert [item["index"] for item in body["results"]] == [0, 1, 2]
        assert [item["prediction"] for item in body["results"]] == ["positive", "negative", "positive"]
        assert all(UUID(item["request_id"]) for item in body["results"])
        assert all(item["prediction_id"] > 0 for item in body["results"])
        assert all(item["latency_ms"] >= 0 for item in body["results"])

        for item in body["results"]:
            request = client.get(f"/api/v1/metrics/requests/{item['request_id']}")
            assert request.status_code == 200, request.text
            request_body = request.json()
            assert request_body["request_id"] == item["request_id"]
            assert request_body["model_id"] == model_id
            assert request_body["version"] == "v1"
            assert request_body["status"] == "success"
            assert request_body["prediction_metric_id"] == item["prediction_id"]

        metrics = client.get(f"/api/v1/metrics/{model_id}/v1").json()
        assert metrics["requests"] == 3
        assert metrics["successful"] == 3
    finally:
        app.dependency_overrides.clear()


def test_single_prediction_accepts_client_request_id_and_rejects_reuse(tmp_path: Path, monkeypatch) -> None:
    client, model_id = _client(tmp_path, monkeypatch)
    request_id = "12345678-1234-5678-1234-567812345678"
    try:
        response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            headers={"X-Request-ID": request_id},
            json={"input": "good model"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["request_id"] == request_id
        assert body["prediction_id"] > 0
        assert body["latency_ms"] >= 0

        duplicate = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            headers={"X-Request-ID": request_id},
            json={"input": "good model"},
        )
        assert duplicate.status_code == 409
        assert duplicate.json()["error"]["message"] == "Request ID has already been used"
    finally:
        app.dependency_overrides.clear()


def test_batch_prediction_rejects_oversized_request(tmp_path: Path, monkeypatch) -> None:
    client, model_id = _client(tmp_path, monkeypatch)
    try:
        response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict/batch",
            json={"inputs": list(range(101))},
        )
        assert response.status_code == 422
        assert response.json()["error"]["message"] == "Request validation failed"
    finally:
        app.dependency_overrides.clear()
