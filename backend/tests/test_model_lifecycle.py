from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.database import get_db
from app.main import app
from app.models.base import Base
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore


def test_delete_model_removes_versions_metrics_and_artifact(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

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
        client = TestClient(
        app,
        headers={"Authorization": "Bearer test-admin-key"},
    )
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


def test_delete_model_clears_runtime_cache(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'runtime_cache.db'}",
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
    store = LocalArtifactStore(artifact_root)
    monkeypatch.setattr(
        "app.api.models.artifact_store",
        store,
    )

    try:
        db = SessionTesting()

        model = Model(
            name="runtime-cache-delete",
            task="test",
            description="runtime cache lifecycle",
        )
        db.add(model)
        db.commit()
        db.refresh(model)

        artifact_file = tmp_path / "artifact.py"
        artifact_file.write_text(
            "def model(value):\n"
            "    return value\n",
            encoding="utf-8",
        )

        artifact_path = store.save(
            model.name,
            "v1",
            "artifact.py",
            artifact_file.read_bytes(),
        )

        version = ModelVersion(
            model_id=model.id,
            version="v1",
            artifact_path=artifact_path,
            framework="python",
        )
        db.add(version)
        db.commit()

        model_id = model.id
        db.close()

        from app.services.runtime_registry import runtime_registry

        runtime = runtime_registry.get("python")
        resolved_path = str(store.resolve(artifact_path))

        loaded = runtime.get_or_load(resolved_path)
        assert resolved_path in runtime._cache

        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        response = client.delete(f"/api/v1/models/{model_id}")
        assert response.status_code == 204

        assert resolved_path not in runtime._cache
        assert loaded is not None

    finally:
        app.dependency_overrides.clear()


def test_delete_model_version_clears_runtime_cache(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'version_cache.db'}",
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
    store = LocalArtifactStore(artifact_root)
    monkeypatch.setattr(
        "app.api.models.artifact_store",
        store,
    )

    try:
        db = SessionTesting()

        model = Model(
            name="runtime-cache-version-delete",
            task="test",
            description="runtime cache version lifecycle",
        )
        db.add(model)
        db.commit()
        db.refresh(model)

        artifact_file = tmp_path / "artifact.py"
        artifact_file.write_text(
            "def model(value):\n"
            "    return value\n",
            encoding="utf-8",
        )

        artifact_path = store.save(
            model.name,
            "v1",
            "artifact.py",
            artifact_file.read_bytes(),
        )

        version = ModelVersion(
            model_id=model.id,
            version="v1",
            artifact_path=artifact_path,
            framework="python",
        )
        db.add(version)
        db.commit()

        model_id = model.id
        db.close()

        from app.services.runtime_registry import runtime_registry

        runtime = runtime_registry.get("python")
        resolved_path = str(store.resolve(artifact_path))

        loaded = runtime.get_or_load(resolved_path)
        assert resolved_path in runtime._cache

        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        response = client.delete(
            f"/api/v1/models/{model_id}/versions/v1"
        )
        assert response.status_code == 204

        assert resolved_path not in runtime._cache
        assert loaded is not None

    finally:
        app.dependency_overrides.clear()

def test_model_version_health_is_healthy_for_valid_artifact(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'health.db'}",
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

    artifact_root = tmp_path / "artifacts"
    store = LocalArtifactStore(artifact_root)
    monkeypatch.setattr("app.api.models.artifact_store", store)

    try:
        db = SessionTesting()

        model = Model(name="health-valid", task="test")
        db.add(model)
        db.commit()
        db.refresh(model)

        artifact_file = tmp_path / "artifact.py"
        artifact_file.write_text(
            "def model(value):\n"
            "    return value\n",
            encoding="utf-8",
        )

        artifact_path = store.save(
            model.name,
            "v1",
            "artifact.py",
            artifact_file.read_bytes(),
        )

        db.add(
            ModelVersion(
                model_id=model.id,
                version="v1",
                artifact_path=artifact_path,
                framework="python",
            )
        )
        db.commit()

        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        response = client.get(
            f"/api/v1/models/{model.id}/versions/v1/health"
        )

        assert response.status_code == 200
        assert response.json() == {
            "model_id": model.id,
            "version": "v1",
            "status": "healthy",
            "framework": "python",
            "artifact_available": True,
            "loadable": True,
            "error": None,
        }

        db.close()
    finally:
        app.dependency_overrides.clear()


def test_model_version_health_is_unhealthy_when_artifact_is_missing(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'health_missing.db'}",
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

    artifact_root = tmp_path / "artifacts"
    store = LocalArtifactStore(artifact_root)
    monkeypatch.setattr("app.api.models.artifact_store", store)

    try:
        db = SessionTesting()

        model = Model(name="health-missing", task="test")
        db.add(model)
        db.commit()
        db.refresh(model)

        artifact_path = artifact_root / "missing.joblib"

        db.add(
            ModelVersion(
                model_id=model.id,
                version="v1",
                artifact_path=str(artifact_path),
                framework="sklearn",
            )
        )
        db.commit()

        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        response = client.get(
            f"/api/v1/models/{model.id}/versions/v1/health"
        )

        assert response.status_code == 200
        body = response.json()

        assert body["status"] == "unhealthy"
        assert body["framework"] == "sklearn"
        assert body["artifact_available"] is False
        assert body["loadable"] is False
        assert body["error"]

        db.close()
    finally:
        app.dependency_overrides.clear()


def test_model_version_health_is_unhealthy_for_invalid_artifact(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'health_invalid.db'}",
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

    artifact_root = tmp_path / "artifacts"
    store = LocalArtifactStore(artifact_root)
    monkeypatch.setattr("app.api.models.artifact_store", store)

    try:
        db = SessionTesting()

        model = Model(name="health-invalid", task="test")
        db.add(model)
        db.commit()
        db.refresh(model)

        artifact_path = store.save(
            model.name,
            "v1",
            "artifact.joblib",
            b"this is not a valid joblib artifact",
        )

        db.add(
            ModelVersion(
                model_id=model.id,
                version="v1",
                artifact_path=artifact_path,
                framework="sklearn",
            )
        )
        db.commit()

        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        response = client.get(
            f"/api/v1/models/{model.id}/versions/v1/health"
        )

        assert response.status_code == 200
        body = response.json()

        assert body["status"] == "unhealthy"
        assert body["artifact_available"] is True
        assert body["loadable"] is False
        assert body["error"]

        db.close()
    finally:
        app.dependency_overrides.clear()


def test_model_version_health_is_unhealthy_for_unsupported_framework(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("MODELDOCK_API_AUTH_ENABLED", "true")
    monkeypatch.setenv("MODELDOCK_ADMIN_API_KEY", "test-admin-key")

    engine = create_engine(
        f"sqlite:///{tmp_path / 'health_framework.db'}",
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

    artifact_root = tmp_path / "artifacts"
    store = LocalArtifactStore(artifact_root)
    monkeypatch.setattr("app.api.models.artifact_store", store)

    try:
        db = SessionTesting()

        model = Model(name="health-framework", task="test")
        db.add(model)
        db.commit()
        db.refresh(model)

        artifact_path = store.save(
            model.name,
            "v1",
            "artifact.bin",
            b"test artifact",
        )

        db.add(
            ModelVersion(
                model_id=model.id,
                version="v1",
                artifact_path=artifact_path,
                framework="unsupported",
            )
        )
        db.commit()

        client = TestClient(
            app,
            headers={"Authorization": "Bearer test-admin-key"},
        )

        response = client.get(
            f"/api/v1/models/{model.id}/versions/v1/health"
        )

        assert response.status_code == 200
        body = response.json()

        assert body["status"] == "unhealthy"
        assert body["framework"] == "unsupported"
        assert body["artifact_available"] is False
        assert body["loadable"] is False
        assert body["error"]

        db.close()
    finally:
        app.dependency_overrides.clear()

