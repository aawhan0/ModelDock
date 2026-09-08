from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.model import Model, ModelVersion


def test_experiment_lineage_tracks_dataset_run_and_model_version(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("app.main.settings.rate_limit_enabled", False)
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'lineage.db'}",
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
    try:
        client = TestClient(app)

        dataset = client.post(
            "/api/v1/datasets",
            json={
                "name": "customer-churn",
                "version": "2026-09",
                "uri": "s3://datasets/customer-churn/2026-09",
                "description": "September training snapshot",
            },
        )
        assert dataset.status_code == 201
        dataset_id = dataset.json()["id"]

        db = SessionTesting()
        model = Model(name="churn-model", task="classification")
        db.add(model)
        db.commit()
        db.refresh(model)
        version = ModelVersion(
            model_id=model.id,
            version="v1",
            artifact_path="models/churn/v1/model.joblib",
            framework="sklearn",
            status="validated",
        )
        db.add(version)
        db.commit()
        db.refresh(version)
        model_id = model.id
        version_id = version.id
        db.close()

        experiment = client.post(
            "/api/v1/experiments",
            json={
                "name": "churn-baseline",
                "description": "Baseline model selection",
            },
        )
        assert experiment.status_code == 201
        experiment_id = experiment.json()["id"]

        run = client.post(
            f"/api/v1/experiments/{experiment_id}/runs",
            json={
                "name": "logreg-baseline",
                "status": "completed",
                "model_version_id": version_id,
                "dataset_id": dataset_id,
                "parameters": {"C": 1.0, "max_iter": 200},
                "metrics": {"accuracy": 0.94, "f1": 0.91},
                "started_at": datetime.now(timezone.utc).isoformat(),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        assert run.status_code == 201
        assert run.json()["metrics"]["accuracy"] == 0.94

        duplicate = client.post(
            f"/api/v1/experiments/{experiment_id}/runs",
            json={"name": "logreg-baseline"},
        )
        assert duplicate.status_code == 409

        lineage = client.get(
            f"/api/v1/experiments/lineage/model-versions/{model_id}/v1"
        )
        assert lineage.status_code == 200
        body = lineage.json()
        assert body["model_id"] == model_id
        assert body["version"] == "v1"
        assert len(body["experiments"]) == 1
        assert body["experiments"][0]["name"] == "churn-baseline"
        assert body["experiments"][0]["runs"][0]["dataset"]["version"] == "2026-09"
        assert body["experiments"][0]["runs"][0]["parameters"]["C"] == 1.0

        updated = client.patch(
            f"/api/v1/runs/{run.json()['id']}",
            json={"status": "completed", "metrics": {"accuracy": 0.95}},
        )
        assert updated.status_code == 200
        assert updated.json()["metrics"]["accuracy"] == 0.95
    finally:
        app.dependency_overrides.clear()


def test_experiment_run_rejects_unknown_references(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr("app.main.settings.rate_limit_enabled", False)
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'lineage_invalid.db'}",
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
    try:
        client = TestClient(app)
        experiment = client.post("/api/v1/experiments", json={"name": "invalid-ref-test"})
        assert experiment.status_code == 201
        experiment_id = experiment.json()["id"]

        response = client.post(
            f"/api/v1/experiments/{experiment_id}/runs",
            json={"name": "missing-model", "model_version_id": 999999},
        )
        assert response.status_code == 404
        assert response.json()["error"]["message"] == "Model version not found"
    finally:
        app.dependency_overrides.clear()
