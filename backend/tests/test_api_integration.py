from pathlib import Path

import joblib
from fastapi.testclient import TestClient
from sklearn.base import BaseEstimator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.artifacts import artifact_store as upload_artifact_store
from app.api.inference import artifact_store as inference_artifact_store
from app.core.database import get_db
from app.main import app
from app.models.base import Base


class FakeClassifier(BaseEstimator):
    def predict(self, values: list[str]) -> list[str]:
        return ["positive" if "love" in value.lower() else "negative" for value in values]


def test_model_version_artifact_prediction_and_metrics(tmp_path: Path, monkeypatch) -> None:
    database_url = f"sqlite:///{tmp_path / 'integration.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
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
    monkeypatch.setattr(upload_artifact_store, "root", artifact_root)
    monkeypatch.setattr(inference_artifact_store, "root", artifact_root)

    artifact_file = tmp_path / "model.joblib"
    joblib.dump(FakeClassifier(), artifact_file)

    try:
        client = TestClient(app)

        model_response = client.post(
            "/api/v1/models",
            json={
                "name": "integration-classifier",
                "task": "text-classification",
                "description": "API integration test",
            },
        )
        assert model_response.status_code == 201
        model_id = model_response.json()["id"]

        version_response = client.post(
            f"/api/v1/models/{model_id}/versions",
            json={
                "version": "v1",
                "artifact_path": "",
                "framework": "sklearn",
            },
        )
        assert version_response.status_code == 201

        with artifact_file.open("rb") as file_handle:
            upload_response = client.post(
                f"/api/v1/models/{model_id}/versions/v1/artifact",
                files={"file": ("model.joblib", file_handle, "application/octet-stream")},
            )
        assert upload_response.status_code == 201
        assert upload_response.json()["artifact_path"]

        prediction_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "I love ModelDock"},
        )
        assert prediction_response.status_code == 200
        assert prediction_response.json()["prediction"] == "positive"

        metrics_response = client.get(f"/api/v1/metrics/{model_id}/v1")
        assert metrics_response.status_code == 200
        assert metrics_response.json()["requests"] == 1
        assert metrics_response.json()["successful"] == 1
        assert metrics_response.json()["failed"] == 0
    finally:
        app.dependency_overrides.clear()


def test_model_not_found_returns_404(tmp_path: Path) -> None:
    database_url = f"sqlite:///{tmp_path / 'not_found.db'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionTesting = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = SessionTesting()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    try:
        client = TestClient(app)
        response = client.get("/api/v1/models/999999")
        assert response.status_code == 404
        assert response.json()["detail"] == "Model not found"
    finally:
        app.dependency_overrides.clear()
