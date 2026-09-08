from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.experiment import Experiment, ExperimentRun
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore


def _setup(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")
    engine = create_engine(
        f"sqlite:///{tmp_path / 'deployment-gates.db'}",
        connect_args={"check_same_thread": False},
    )
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
    return SessionTesting, store


def _seed_version(SessionTesting, store, status="validated"):
    db = SessionTesting()
    model = Model(name="gated-model", task="classification")
    db.add(model)
    db.commit()
    db.refresh(model)

    artifact = store.save(
        model.name,
        "v1",
        "artifact.py",
        b"def model(value):\n    return value\n",
    )
    version = ModelVersion(
        model_id=model.id,
        version="v1",
        artifact_path=artifact,
        framework="python",
        status=status,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    model_id = model.id
    db.close()
    return model_id


def test_deployment_policy_requires_completed_evaluation_run(tmp_path, monkeypatch):
    SessionTesting, store = _setup(tmp_path, monkeypatch)
    try:
        model_id = _seed_version(SessionTesting, store)
        client = TestClient(app, headers={"Authorization": "Bearer test-admin-key"})

        response = client.put(
            f"/api/v1/models/{model_id}/deployment-policy",
            json={"minimum_metrics": {"accuracy": 0.9}},
        )
        assert response.status_code == 200
        assert response.json()["minimum_metrics"] == {"accuracy": 0.9}

        readiness = client.get(
            f"/api/v1/models/{model_id}/versions/v1/deployment-readiness"
        )
        assert readiness.status_code == 200
        assert readiness.json()["allowed"] is False
        assert "No completed evaluation run" in readiness.json()["failures"][0]

        deploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
        assert deploy.status_code == 409
        assert "Deployment policy rejected" in deploy.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()


def test_deployment_policy_allows_version_when_latest_run_meets_threshold(tmp_path, monkeypatch):
    SessionTesting, store = _setup(tmp_path, monkeypatch)
    try:
        model_id = _seed_version(SessionTesting, store)
        db = SessionTesting()
        version = db.query(ModelVersion).filter_by(model_id=model_id, version="v1").one()
        experiment = Experiment(name="gated-eval", status="completed")
        db.add(experiment)
        db.commit()
        db.add(
            ExperimentRun(
                experiment_id=experiment.id,
                model_version_id=version.id,
                name="evaluation",
                status="completed",
                metrics={"accuracy": 0.95},
            )
        )
        db.commit()
        db.close()

        client = TestClient(app, headers={"Authorization": "Bearer test-admin-key"})
        assert client.put(
            f"/api/v1/models/{model_id}/deployment-policy",
            json={"minimum_metrics": {"accuracy": 0.9}},
        ).status_code == 200

        readiness = client.get(
            f"/api/v1/models/{model_id}/versions/v1/deployment-readiness"
        )
        assert readiness.json()["allowed"] is True

        deploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
        assert deploy.status_code == 200
        assert deploy.json()["status"] == "deployed"
    finally:
        app.dependency_overrides.clear()


def test_deployment_policy_rejects_below_threshold_and_reports_multiple_failures(tmp_path, monkeypatch):
    SessionTesting, store = _setup(tmp_path, monkeypatch)
    try:
        model_id = _seed_version(SessionTesting, store)
        db = SessionTesting()
        version = db.query(ModelVersion).filter_by(model_id=model_id, version="v1").one()
        experiment = Experiment(name="gated-eval-fail", status="completed")
        db.add(experiment)
        db.commit()
        db.add(
            ExperimentRun(
                experiment_id=experiment.id,
                model_version_id=version.id,
                name="evaluation",
                status="completed",
                metrics={"accuracy": 0.7},
            )
        )
        db.commit()
        db.close()

        client = TestClient(app, headers={"Authorization": "Bearer test-admin-key"})
        assert client.put(
            f"/api/v1/models/{model_id}/deployment-policy",
            json={"minimum_metrics": {"accuracy": 0.9, "f1": 0.8}},
        ).status_code == 200

        readiness = client.get(
            f"/api/v1/models/{model_id}/versions/v1/deployment-readiness"
        )
        body = readiness.json()
        assert body["allowed"] is False
        assert len(body["failures"]) == 2
    finally:
        app.dependency_overrides.clear()


def test_disabled_deployment_policy_does_not_block_deployment(tmp_path, monkeypatch):
    SessionTesting, store = _setup(tmp_path, monkeypatch)
    try:
        model_id = _seed_version(SessionTesting, store)
        client = TestClient(app, headers={"Authorization": "Bearer test-admin-key"})
        response = client.put(
            f"/api/v1/models/{model_id}/deployment-policy",
            json={"enabled": False, "minimum_metrics": {"accuracy": 0.99}},
        )
        assert response.status_code == 200

        readiness = client.get(
            f"/api/v1/models/{model_id}/versions/v1/deployment-readiness"
        )
        assert readiness.json() == {
            "model_id": model_id,
            "version": "v1",
            "allowed": True,
            "policy_enabled": False,
            "run_id": None,
            "metrics": {},
            "failures": [],
        }

        deploy = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
        assert deploy.status_code == 200
    finally:
        app.dependency_overrides.clear()
