import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import DeploymentEvent, Model, ModelVersion
from app.schemas.model import ModelCreate, ModelRead, ModelUpdate, ModelVersionCreate, ModelVersionRead
from app.services.artifact_store import LocalArtifactStore, verify_artifact
from app.services.runtime_registry import runtime_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models", tags=["models"])
artifact_store = LocalArtifactStore()


def _record_deployment_event(
    db: Session,
    model_version: ModelVersion,
    action: str,
    previous_version: str | None = None,
) -> None:
    db.add(
        DeploymentEvent(
            model_version_id=model_version.id,
            action=action,
            previous_version=previous_version,
        )
    )


@router.post("", response_model=ModelRead, status_code=status.HTTP_201_CREATED)
def create_model(payload: ModelCreate, db: Session = Depends(get_db)) -> Model:
    model = Model(**payload.model_dump())
    db.add(model)
    try:
        db.commit()
        db.refresh(model)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Model name already exists") from exc
    return model


@router.get("", response_model=list[ModelRead])
def list_models(db: Session = Depends(get_db)) -> list[Model]:
    return list(db.scalars(select(Model).order_by(Model.id)).all())


@router.get("/{model_id}", response_model=ModelRead)
def get_model(model_id: int, db: Session = Depends(get_db)) -> Model:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")
    return model


@router.patch("/{model_id}", response_model=ModelRead)
def update_model(model_id: int, payload: ModelUpdate, db: Session = Depends(get_db)) -> Model:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(model, field, value)

    try:
        db.commit()
        db.refresh(model)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Model name already exists") from exc
    return model


@router.post("/{model_id}/versions", response_model=ModelVersionRead, status_code=status.HTTP_201_CREATED)
def create_model_version(
    model_id: int,
    payload: ModelVersionCreate,
    db: Session = Depends(get_db),
) -> ModelVersion:
    if db.get(Model, model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")

    version = ModelVersion(model_id=model_id, **payload.model_dump())
    db.add(version)
    try:
        db.commit()
        db.refresh(version)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Model version already exists") from exc
    return version


@router.get("/{model_id}/versions", response_model=list[ModelVersionRead])
def list_model_versions(model_id: int, db: Session = Depends(get_db)) -> list[ModelVersion]:
    if db.get(Model, model_id) is None:
        raise HTTPException(status_code=404, detail="Model not found")

    return list(
        db.scalars(
            select(ModelVersion)
            .where(ModelVersion.model_id == model_id)
            .order_by(ModelVersion.id)
        ).all()
    )


@router.get("/{model_id}/versions/{version}/deployment-history")
def deployment_history(
    model_id: int,
    version: str,
    limit: int = 50,
    db: Session = Depends(get_db),
) -> list[dict[str, object]]:
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 100")
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    events = (
        db.query(DeploymentEvent)
        .filter(DeploymentEvent.model_version_id == model_version.id)
        .order_by(DeploymentEvent.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": event.id,
            "action": event.action,
            "version": version,
            "previous_version": event.previous_version,
            "created_at": event.created_at,
        }
        for event in events
    ]


@router.get("/{model_id}/versions/{version}/health")
def model_version_health(model_id: int, version: str, db: Session = Depends(get_db)) -> dict[str, object]:
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    try:
        runtime = runtime_registry.get(model_version.framework)
    except ValueError as exc:
        return {
            "model_id": model_id,
            "version": version,
            "status": "unhealthy",
            "framework": model_version.framework,
            "artifact_available": False,
            "loadable": False,
            "error": str(exc),
        }

    artifact_available = False
    integrity_verified = model_version.artifact_sha256 is None
    loadable = False
    error: str | None = None

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        artifact_available = artifact_path.is_file()
        if not artifact_available:
            raise FileNotFoundError("Model artifact not found")
        if model_version.artifact_sha256:
            integrity_verified = verify_artifact(artifact_path, model_version.artifact_sha256, model_version.artifact_size_bytes)
            if not integrity_verified:
                raise ValueError("Model artifact integrity check failed")
        runtime.load(str(artifact_path))
        loadable = True
    except (ValueError, OSError) as exc:
        error = str(exc)
    except Exception:
        logger.exception("Model version health check failed for model %s version %s", model_id, version)
        error = "Unable to validate model artifact"

    return {
        "model_id": model_id,
        "version": version,
        "status": "healthy" if artifact_available and loadable else "unhealthy",
        "framework": model_version.framework,
        "artifact_available": artifact_available,
        "integrity_verified": integrity_verified,
        "loadable": loadable,
        "error": error,
    }


@router.delete("/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(model_id: int, db: Session = Depends(get_db)) -> None:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    artifact_versions = [
        (version.framework, version.artifact_path)
        for version in model.versions
        if version.artifact_path
    ]

    db.delete(model)
    db.commit()

    for framework, artifact_path in artifact_versions:
        try:
            runtime = runtime_registry.get(framework)
            runtime.clear_artifact(str(artifact_store.resolve(artifact_path)))
        except (ValueError, OSError):
            pass

    for _, artifact_path in artifact_versions:
        try:
            path = artifact_store.resolve(artifact_path)
            if path.is_file():
                path.unlink()
        except (ValueError, OSError):
            pass


@router.delete("/{model_id}/versions/{version}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model_version(model_id: int, version: str, db: Session = Depends(get_db)) -> None:
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    artifact_path = model_version.artifact_path
    framework = model_version.framework

    if model_version.status == "deployed":
        raise HTTPException(status_code=409, detail="Cannot delete a deployed model version")

    db.delete(model_version)
    db.commit()

    if artifact_path:
        try:
            runtime = runtime_registry.get(framework)
            runtime.clear_artifact(str(artifact_store.resolve(artifact_path)))
        except (ValueError, OSError):
            pass

        try:
            path = artifact_store.resolve(artifact_path)
            if path.is_file():
                path.unlink()
        except (ValueError, OSError):
            pass


@router.post("/{model_id}/versions/{version}/deploy", response_model=ModelVersionRead)
def deploy_model_version(model_id: int, version: str, db: Session = Depends(get_db)) -> ModelVersion:
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if not model_version.artifact_path:
        raise HTTPException(status_code=409, detail="Model version has no artifact")
    if model_version.status == "deployed":
        return model_version
    if model_version.status != "validated":
        raise HTTPException(status_code=409, detail="Only validated model versions can be deployed")

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        runtime = runtime_registry.get(model_version.framework)
        if model_version.artifact_sha256 and not verify_artifact(artifact_path, model_version.artifact_sha256, model_version.artifact_size_bytes):
            raise ValueError("Model artifact integrity check failed")
        runtime.load(str(artifact_path))
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=409, detail=f"Model version is not deployable: {exc}") from exc
    except Exception:
        logger.exception("Model version deployment validation failed for model %s version %s", model_id, version)
        raise HTTPException(status_code=409, detail="Model version failed validation") from None

    previous_version = None
    deployed_versions = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.id != model_version.id,
            ModelVersion.status == "deployed",
        )
        .all()
    )

    previous_artifacts: list[tuple[str, str]] = []
    for deployed_version in deployed_versions:
        previous_version = deployed_version.version
        deployed_version.status = "retired"
        if deployed_version.artifact_path:
            previous_artifacts.append((deployed_version.framework, deployed_version.artifact_path))

    model_version.status = "deployed"
    try:
        _record_deployment_event(db, model_version, "deploy", previous_version)
        db.commit()
        db.refresh(model_version)
    except Exception:
        db.rollback()
        raise

    for framework, previous_artifact_path in previous_artifacts:
        try:
            previous_runtime = runtime_registry.get(framework)
            previous_runtime.clear_artifact(str(artifact_store.resolve(previous_artifact_path)))
        except (ValueError, OSError):
            pass

    return model_version


@router.post("/{model_id}/versions/{version}/rollback", response_model=ModelVersionRead)
def rollback_model_version(model_id: int, version: str, db: Session = Depends(get_db)) -> ModelVersion:
    """Atomically make a validated or retired version the active deployment."""
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status == "deployed":
        return model_version
    if model_version.status not in {"validated", "retired"}:
        raise HTTPException(
            status_code=409,
            detail="Only validated or retired model versions can be rolled back",
        )
    if not model_version.artifact_path:
        raise HTTPException(status_code=409, detail="Model version has no artifact")

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        if not artifact_path.is_file():
            raise OSError("Model artifact not found")
        runtime = runtime_registry.get(model_version.framework)
        if model_version.artifact_sha256 and not verify_artifact(
            artifact_path,
            model_version.artifact_sha256,
            model_version.artifact_size_bytes,
        ):
            raise ValueError("Model artifact integrity check failed")
        runtime.load(str(artifact_path))
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=409, detail=f"Model version is not deployable: {exc}") from exc
    except Exception:
        logger.exception("Model version rollback validation failed for model %s version %s", model_id, version)
        raise HTTPException(status_code=409, detail="Model version failed validation") from None

    previous_version = None
    deployed_versions = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.id != model_version.id,
            ModelVersion.status == "deployed",
        )
        .all()
    )

    previous_artifacts: list[tuple[str, str]] = []
    for deployed_version in deployed_versions:
        previous_version = deployed_version.version
        deployed_version.status = "retired"
        if deployed_version.artifact_path:
            previous_artifacts.append((deployed_version.framework, deployed_version.artifact_path))

    model_version.status = "deployed"
    try:
        _record_deployment_event(db, model_version, "rollback", previous_version)
        db.commit()
        db.refresh(model_version)
    except Exception:
        db.rollback()
        raise

    for framework, previous_artifact_path in previous_artifacts:
        try:
            previous_runtime = runtime_registry.get(framework)
            previous_runtime.clear_artifact(str(artifact_store.resolve(previous_artifact_path)))
        except (ValueError, OSError):
            pass

    logger.info(
        "Rolled back model %s to version %s",
        model_id,
        version,
    )
    return model_version


@router.post("/{model_id}/versions/{version}/revalidate", response_model=ModelVersionRead)
def revalidate_model_version(model_id: int, version: str, db: Session = Depends(get_db)) -> ModelVersion:
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status != "retired":
        raise HTTPException(status_code=409, detail="Only retired model versions can be revalidated")

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        if not artifact_path.is_file():
            raise OSError(f"Artifact file not found: {artifact_path}")
        runtime = runtime_registry.get(model_version.framework)
        if model_version.artifact_sha256 and not verify_artifact(
            artifact_path,
            model_version.artifact_sha256,
            model_version.artifact_size_bytes,
        ):
            raise ValueError("Model artifact integrity check failed")
        runtime.load(str(artifact_path))
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=409, detail=f"Model version is not revalidatable: {exc}") from exc
    except Exception:
        logger.exception("Model version revalidation failed for model %s version %s", model_id, version)
        raise HTTPException(status_code=409, detail="Model version failed validation") from None

    model_version.status = "validated"
    db.commit()
    db.refresh(model_version)
    return model_version


@router.post("/{model_id}/versions/{version}/undeploy", response_model=ModelVersionRead)
def undeploy_model_version(model_id: int, version: str, db: Session = Depends(get_db)) -> ModelVersion:
    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")
    if model_version.status != "deployed":
        raise HTTPException(status_code=409, detail="Only deployed model versions can be undeployed")

    artifact_path = model_version.artifact_path
    framework = model_version.framework
    model_version.status = "retired"
    try:
        _record_deployment_event(db, model_version, "undeploy")
        db.commit()
        db.refresh(model_version)
    except Exception:
        db.rollback()
        raise

    if artifact_path:
        try:
            runtime = runtime_registry.get(framework)
            runtime.clear_artifact(str(artifact_store.resolve(artifact_path)))
        except (ValueError, OSError):
            pass

    return model_version
