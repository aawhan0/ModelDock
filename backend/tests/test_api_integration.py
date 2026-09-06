from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.artifacts import artifact_store as upload_artifact_store
from app.api.inference import artifact_store as inference_artifact_store
from app.db.base import Base
from app.db.session import get_db
from app.main import app


# Existing tests above this point remain unchanged.


def test_replacing_artifact_invalidates_runtime_cache(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    database_url = f"sqlite:///{tmp_path / 'replacement.db'}"
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    SessionTesting = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

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
    monkeypatch.setattr("app.api.models.artifact_store", upload_artifact_store)

    try:
        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        model_response = client.post(
            "/api/v1/models",
            json={
                "name": "replacement-test",
                "task": "test",
                "description": "artifact replacement",
            },
        )
        assert model_response.status_code == 201
        model_id = model_response.json()["id"]

        version_response = client.post(
            f"/api/v1/models/{model_id}/versions",
            json={
                "version": "v1",
                "artifact_path": "",
                "framework": "python",
            },
        )
        assert version_response.status_code == 201

        artifact_a = b"def model(value):\n    return \"model-a\"\n"
        artifact_b = b"def model(value):\n    return \"model-b\"\n"

        first_upload = client.post(
            f"/api/v1/models/{model_id}/versions/v1/artifact",
            files={
                "file": (
                    "model_a.py",
                    artifact_a,
                    "text/plain",
                )
            },
        )
        assert first_upload.status_code == 201
        first_path = first_upload.json()["artifact_path"]

        deploy_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/deploy"
        )
        assert deploy_response.status_code == 200, deploy_response.text

        first_prediction = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "hello"},
        )
        assert first_prediction.status_code == 200
        assert first_prediction.json()["prediction"] == "model-a"

        from app.services.runtime_registry import runtime_registry

        runtime = runtime_registry.get("python")
        resolved_first_path = str(Path(first_path).resolve())
        assert resolved_first_path in runtime._cache

        undeploy_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/undeploy"
        )
        assert undeploy_response.status_code == 200, undeploy_response.text
        assert resolved_first_path not in runtime._cache

        second_upload = client.post(
            f"/api/v1/models/{model_id}/versions/v1/artifact",
            files={
                "file": (
                    "model_b.py",
                    artifact_b,
                    "text/plain",
                )
            },
        )
        assert second_upload.status_code == 201

        second_path = second_upload.json()["artifact_path"]
        assert second_path != first_path
        assert not Path(first_path).exists()

        redeploy_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/deploy"
        )
        assert redeploy_response.status_code == 200, redeploy_response.text

        second_prediction = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "hello"},
        )
        assert second_prediction.status_code == 200
        assert second_prediction.json()["prediction"] == "model-b"

    finally:
        app.dependency_overrides.clear()
