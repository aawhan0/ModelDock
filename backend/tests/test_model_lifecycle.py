from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.model import Model, ModelVersion
from app.services import artifact_store


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
    monkeypatch.setattr(artifact_store, "root", tmp_path / "artifacts")

    model_path = tmp_path / "artifact.joblib"
    model_path.write_bytes(b"test artifact")

    try:
        client = TestClient(app)
        model = Model(name="delete-me", task="test", description="lifecycle")
        db = SessionTesting()
        db.add(model)
        db.commit()
        db.refresh(model)
        version = ModelVersion(
            model_id=model.id,
            version="v1",
            artifact_path=artifact_store.LocalArtifactStore(tmp_path / "artifacts").save(
                model.name, "v1", "artifact.joblib", model_path.read_bytes()
            ),
            framework="sklearn",
        )
        db.add(version)
        db.commit()
        version_path = Path(version.artifact_path)
        db.close()

        response = client.delete(f"/api/v1/models/{model.id}")
        assert response.status_code == 204
        assert not version_path.exists()

        db = SessionTesting()
        assert db.get(Model, model.id) is None
        assert db.query(ModelVersion).filter(ModelVersion.model_id == model.id).count() == 0
        db.close()
    finally:
        app.dependency_overrides.clear()
