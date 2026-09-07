from pathlib import Path

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


class LifecycleClassifier(BaseEstimator):
    def predict(self, values: list[str]) -> list[str]:
        return ["positive" if "love" in value.lower() else "negative" for value in values]


def test_complete_model_lifecycle(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(f"sqlite:///{tmp_path / 'lifecycle.db'}", connect_args={"check_same_thread": False})
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
    stores = [upload_artifact_store, inference_artifact_store, model_artifact_store]
    for store in stores:
        monkeypatch.setattr(store, "root", artifact_root)

    artifact_file = tmp_path / "model.joblib"
    joblib.dump(LifecycleClassifier(), artifact_file)

    try:
        client = TestClient(app, headers={"Authorization": "Bearer test-admin-key"})

        model = client.post("/api/v1/models", json={
            "name": "lifecycle-model",
            "task": "text-classification",
            "description": "full lifecycle",
        })
        assert model.status_code == 201
        model_id = model.json()["id"]

        version = client.post(f"/api/v1/models/{model_id}/versions", json={
            "version": "v1",
            "artifact_path": "",
            "framework": "sklearn",
        })
        assert version.status_code == 201

        with artifact_file.open("rb") as handle:
            upload = client.post(
                f"/api/v1/models/{model_id}/versions/v1/artifact",
                files={"file": ("model.joblib", handle, "application/octet-stream")},
            )
        assert upload.status_code == 201

        health = client.get(f"/api/v1/models/{model_id}/versions/v1/health")
        assert health.status_code == 200
        assert health.json()["status"] == "healthy"

        deploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
        assert deploy.status_code == 200
        assert deploy.json()["status"] == "deployed"

        prediction = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "I love ModelDock"},
        )
        assert prediction.status_code == 200
        assert prediction.json() == {
            "model": "lifecycle-model",
            "version": "v1",
            "prediction": "positive",
        }

        metrics = client.get(f"/api/v1/metrics/{model_id}/v1")
        assert metrics.status_code == 200
        assert metrics.json()["requests"] == 1
        assert metrics.json()["successful"] == 1
        assert metrics.json()["failed"] == 0

        history = client.get(f"/api/v1/metrics/{model_id}/v1/history")
        assert history.status_code == 200
        assert len(history.json()) == 1
        assert history.json()[0]["success"] is True

        undeploy = client.post(f"/api/v1/models/{model_id}/versions/v1/undeploy")
        assert undeploy.status_code == 200
        assert undeploy.json()["status"] != "deployed"

        rejected = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "I love ModelDock"},
        )
        assert rejected.status_code == 409

        redeploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
        assert redeploy.status_code == 200
        assert redeploy.json()["status"] == "deployed"

        final_prediction = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "I love ModelDock"},
        )
        assert final_prediction.status_code == 200
        assert final_prediction.json()["prediction"] == "positive"
    finally:
        app.dependency_overrides.clear()
