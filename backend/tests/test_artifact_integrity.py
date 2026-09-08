from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore, artifact_sha256, verify_artifact


def test_artifact_digest_helpers_detect_tampering(tmp_path: Path) -> None:
    store = LocalArtifactStore(tmp_path / "artifacts")
    path = Path(store.save("model", "v1", "model.py", b"original"))
    digest = artifact_sha256(b"original")

    assert verify_artifact(path, digest, len(b"original"))
    path.write_bytes(b"tampered")
    assert not verify_artifact(path, digest, len(b"original"))


def test_upload_records_artifact_integrity_metadata(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")
    engine = create_engine(f"sqlite:///{tmp_path / 'upload.db'}", connect_args={"check_same_thread": False})
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
    monkeypatch.setattr("app.api.artifacts.artifact_store", store)

    try:
        client = TestClient(app)
        model = client.post("/api/v1/models", json={"name": "integrity-upload", "task": "test"}).json()
        model_id = model["id"]
        assert client.post(
            f"/api/v1/models/{model_id}/versions",
            json={"version": "v1", "artifact_path": "", "framework": "python"},
        ).status_code == 201

        content = b"def model(value):\n    return value\n"
        response = client.post(
            f"/api/v1/models/{model_id}/versions/v1/artifact",
            files={"file": ("model.py", content, "text/plain")},
        )
        assert response.status_code == 201

        db = SessionTesting()
        version = db.query(ModelVersion).filter_by(model_id=model_id, version="v1").one()
        assert version.artifact_sha256 == artifact_sha256(content)
        assert version.artifact_size_bytes == len(content)
        db.close()
    finally:
        app.dependency_overrides.clear()


def test_deploy_rejects_tampered_artifact(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "false")
    engine = create_engine(f"sqlite:///{tmp_path / 'tamper.db'}", connect_args={"check_same_thread": False})
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

    try:
        db = SessionTesting()
        model = Model(name="integrity-deploy", task="test")
        db.add(model)
        db.commit()
        db.refresh(model)

        content = b"def model(value):\n    return value\n"
        path = store.save(model.name, "v1", "model.py", content)
        db.add(ModelVersion(
            model_id=model.id,
            version="v1",
            artifact_path=path,
            framework="python",
            status="validated",
            artifact_sha256=artifact_sha256(content),
            artifact_size_bytes=len(content),
        ))
        db.commit()
        model_id = model.id
        Path(path).write_bytes(b"tampered artifact")
        db.close()

        client = TestClient(app)
        response = client.post(f"/api/v1/models/{model_id}/versions/v1/deploy")
        assert response.status_code == 409
        assert "Model artifact integrity check failed" in response.json()["error"]["message"]
    finally:
        app.dependency_overrides.clear()
