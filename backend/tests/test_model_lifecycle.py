from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore


def test_delete_model_removes_versions_metrics_and_artifact(tmp_path: Path, monkeypatch) -> None:
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}", connect_args={"check_same_thread": False})
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
    monkeypatch.setattr("app.api.models.artifact_store", LocalArtifactStore(artifact_root))

    model_path = tmp_path / "artifact.joblib"
    model_path.write_bytes(b"test artifact")

    try:
        client = TestClient(app)
        db = SessionTesting()
        model = Model(name="delete-me", task="test", description="lifecycle")
        db.add(model)
        db.commit()
        db.refresh(model)

        store = LocalArtifactStore(artifact_root)
        artifact_path = store.save(model.name, "v1", "artifact.joblib", model_path.read_bytes())
        version = ModelVersion(
            model_id=model.id,
            version="v1",
            artifact_path=artifact_path,
            framework="sklearn",
        )
        db.add(version)
        db.commit()
        version_path = Path(artifact_path)
        model_id = model.id
        db.close()

        response = client.delete(f"/api/v1/models/{model_id}")
        assert response.status_code == 204
        assert not version_path.exists()

        db = SessionTesting()
        assert db.get(Model, model_id) is None
        assert db.query(ModelVersion).filter(ModelVersion.model_id == model_id).count() == 0
        db.close()
    finally:
        app.dependency_overrides.clear()
