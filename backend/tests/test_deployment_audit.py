from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.model import DeploymentEvent, Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore


def test_deployment_history_records_deploy_rollback_and_undeploy(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")
    engine = create_engine(f"sqlite:///{tmp_path / 'deployment_history.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    SessionTesting = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = SessionTesting()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    store = LocalArtifactStore(tmp_path / "artifacts")
    monkeypatch.setattr("app.api.models.artifact_store", store)
    monkeypatch.setattr("app.api.inference.artifact_store", store)
    monkeypatch.setattr("app.api.artifacts.artifact_store", store)

    try:
        client = TestClient(app)
        model = client.post("/api/v1/models", json={"name": "audit-model", "task": "test"}).json()
        model_id = model["id"]
        for version in ("v1", "v2"):
            assert client.post(
                f"/api/v1/models/{model_id}/versions",
                json={"version": version, "artifact_path": "", "framework": "python"},
            ).status_code == 201
            response = client.post(
                f"/api/v1/models/{model_id}/versions/{version}/artifact",
                files={"file": (f"{version}.py", b"def model(value):\n    return value\n", "text/plain")},
            )
            assert response.status_code == 201

        assert client.post(f"/api/v1/models/{model_id}/versions/v1/deploy").status_code == 200
        assert client.post(f"/api/v1/models/{model_id}/versions/v1/undeploy").status_code == 200
        assert client.post(f"/api/v1/models/{model_id}/versions/v2/deploy").status_code == 200
        assert client.post(f"/api/v1/models/{model_id}/versions/v1/rollback").status_code == 200

        history = client.get(f"/api/v1/models/{model_id}/versions/v1/deployment-history")
        assert history.status_code == 200
        assert [item["action"] for item in history.json()] == ["rollback", "undeploy", "deploy"]
        assert history.json()[0]["previous_version"] == "v2"
        assert history.json()[-1]["previous_version"] is None

        db = SessionTesting()
        assert db.query(DeploymentEvent).count() == 4
        db.close()
    finally:
        app.dependency_overrides.clear()
