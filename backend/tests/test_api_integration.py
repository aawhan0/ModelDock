from app.services.artifact_store import LocalArtifactStore
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


def test_model_version_artifact_prediction_and_metrics(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

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
    monkeypatch.setattr("app.api.models.artifact_store", LocalArtifactStore(artifact_root))

    artifact_file = tmp_path / "model.joblib"
    joblib.dump(FakeClassifier(), artifact_file)

    try:
        client = TestClient(
        app,
        headers={"Authorization": "Bearer test-admin-key"},
    )

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

        deploy_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/deploy"
        )
        assert deploy_response.status_code == 200, deploy_response.text

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


def test_model_not_found_returns_404(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

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
        client = TestClient(
        app,
        headers={"Authorization": "Bearer test-admin-key"},
    )
        response = client.get("/api/v1/models/999999")
        assert response.status_code == 404
        assert response.json()["detail"] == "Model not found"
    finally:
        app.dependency_overrides.clear()


def _create_test_model_and_version(
    tmp_path: Path,
    monkeypatch,
    client: TestClient,
    framework: str,
) -> tuple[int, Path]:
    database_url = f"sqlite:///{tmp_path / (framework + '.db')}"
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

    model_response = client.post(
        "/api/v1/models",
        json={
            "name": f"validation-{framework}",
            "task": "test",
            "description": "artifact validation",
        },
    )
    assert model_response.status_code == 201
    model_id = model_response.json()["id"]

    version_response = client.post(
        f"/api/v1/models/{model_id}/versions",
        json={
            "version": "v1",
            "artifact_path": "",
            "framework": framework,
        },
    )
    assert version_response.status_code == 201

    return model_id, artifact_root


def test_empty_artifact_is_rejected(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    client = TestClient(
        app,
        headers={"Authorization": "Bearer test-admin-key"},
    )

    model_id, _ = _create_test_model_and_version(
        tmp_path,
        monkeypatch,
        client,
        "sklearn",
    )

    response = client.post(
        f"/api/v1/models/{model_id}/versions/v1/artifact",
        files={
            "file": (
                "empty.joblib",
                b"",
                "application/octet-stream",
            )
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Artifact file is empty"

    app.dependency_overrides.clear()


def test_invalid_sklearn_artifact_is_rejected(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    client = TestClient(
        app,
        headers={"Authorization": "Bearer test-admin-key"},
    )

    model_id, _ = _create_test_model_and_version(
        tmp_path,
        monkeypatch,
        client,
        "sklearn",
    )

    response = client.post(
        f"/api/v1/models/{model_id}/versions/v1/artifact",
        files={
            "file": (
                "invalid.joblib",
                b"this is not a joblib model",
                "application/octet-stream",
            )
        },
    )

    assert response.status_code == 422

    app.dependency_overrides.clear()


def test_unsupported_framework_is_rejected(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    client = TestClient(
        app,
        headers={"Authorization": "Bearer test-admin-key"},
    )

    model_id, _ = _create_test_model_and_version(
        tmp_path,
        monkeypatch,
        client,
        "unsupported-framework",
    )

    response = client.post(
        f"/api/v1/models/{model_id}/versions/v1/artifact",
        files={
            "file": (
                "model.bin",
                b"some model",
                "application/octet-stream",
            )
        },
    )

    assert response.status_code == 422
    assert "Unsupported model framework" in response.json()["detail"]

    app.dependency_overrides.clear()


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
    monkeypatch.setattr("app.api.models.artifact_store", LocalArtifactStore(artifact_root))

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

        redeploy_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/deploy"
        )
        assert redeploy_response.status_code == 200, redeploy_response.text

        assert second_path != first_path
        assert not Path(first_path).exists()
        assert resolved_first_path not in runtime._cache

        second_prediction = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "hello"},
        )
        assert second_prediction.status_code == 200
        assert second_prediction.json()["prediction"] == "model-b"

    finally:
        app.dependency_overrides.clear()



def test_failed_inference_records_error(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    database_url = f"sqlite:///{tmp_path / 'failure_metrics.db'}"
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
    monkeypatch.setattr("app.api.models.artifact_store", LocalArtifactStore(artifact_root))

    try:
        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        model_response = client.post(
            "/api/v1/models",
            json={
                "name": "failure-metrics-test",
                "task": "text-classification",
                "description": "failure metrics",
            },
        )
        assert model_response.status_code == 201
        model_id = model_response.json()["id"]

        version_response = client.post(
            f"/api/v1/models/{model_id}/versions",
            json={
                "version": "v1",
                "artifact_path": "",
                "framework": "json",
            },
        )
        assert version_response.status_code == 201

        artifact = b'{"predictions": {"hello": "positive"}}'

        upload_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/artifact",
            files={
                "file": (
                    "model.json",
                    artifact,
                    "application/json",
                )
            },
        )
        assert upload_response.status_code == 201

        deploy_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/deploy"
        )
        assert deploy_response.status_code == 200, deploy_response.text

        prediction_response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/predict",
            json={"input": "unknown-input"},
        )
        assert prediction_response.status_code == 422

        history_response = client.get(
            f"/api/v1/metrics/{model_id}/v1/history"
        )
        assert history_response.status_code == 200

        history = history_response.json()

        assert len(history) == 1
        assert history[0]["success"] is False
        assert history[0]["prediction"] is None
        assert history[0]["error"]
        assert "No prediction configured" in history[0]["error"]

    finally:
        app.dependency_overrides.clear()
