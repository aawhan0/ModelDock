from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.schemas.model import ModelCreate, ModelRead, ModelVersionCreate, ModelVersionRead
from app.services.artifact_store import LocalArtifactStore
from app.services.runtime_registry import runtime_registry

router = APIRouter(prefix="/models", tags=["models"])
artifact_store = LocalArtifactStore()


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

    for framework, artifact_path in artifact_versions:
        try:
            runtime = runtime_registry.get(framework)
            runtime.clear_artifact(str(artifact_store.resolve(artifact_path)))
        except (ValueError, OSError):
            pass

    db.delete(model)
    db.commit()

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

    if artifact_path:
        try:
            runtime = runtime_registry.get(framework)
            runtime.clear_artifact(str(artifact_store.resolve(artifact_path)))
        except (ValueError, OSError):
            pass

    db.delete(model_version)
    db.commit()

    if artifact_path:
        try:
            path = artifact_store.resolve(artifact_path)
            if path.is_file():
                path.unlink()
        except (ValueError, OSError):
            pass




@router.post("/{model_id}/versions/{version}/deploy", response_model=ModelVersionRead)
def deploy_model_version(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> ModelVersion:
    model_version = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.version == version,
        )
        .first()
    )

    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    if model_version.status not in {"validated", "deployed"}:
        raise HTTPException(
            status_code=409,
            detail="Only validated model versions can be deployed",
        )

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        runtime = runtime_registry.get(model_version.framework)
        runtime.load(str(artifact_path))
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Model version is not deployable: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Model version failed validation: {exc}",
        ) from exc

    deployed_versions = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.id != model_version.id,
            ModelVersion.status == "deployed",
        )
        .all()
    )

    for deployed_version in deployed_versions:
        deployed_version.status = "retired"

    model_version.status = "deployed"
    db.commit()
    db.refresh(model_version)

    return model_version

 
@router.post("/{model_id}/versions/{version}/revalidate", response_model=ModelVersionRead)
def revalidate_model_version(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> ModelVersion:
    model_version = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.version == version,
        )
        .first()
    )

    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    if model_version.status != "retired":
        raise HTTPException(
            status_code=409,
            detail="Only retired model versions can be revalidated",
        )

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)

        if not artifact_path.is_file():
            raise OSError(f"Artifact file not found: {artifact_path}")

        runtime = runtime_registry.get(model_version.framework)
        runtime.load(str(artifact_path))
    except (ValueError, OSError) as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Model version is not revalidatable: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Model version failed validation: {exc}",
        ) from exc

    model_version.status = "validated"
    db.commit()
    db.refresh(model_version)

    return model_version


@router.post("/{model_id}/versions/{version}/undeploy", response_model=ModelVersionRead)
def undeploy_model_version(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> ModelVersion:
    model_version = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.version == version,
        )
        .first()
    )

    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    if model_version.status != "deployed":
        raise HTTPException(
            status_code=409,
            detail="Model version is not deployed",
        )

    model_version.status = "retired"
    db.commit()
    db.refresh(model_version)

    return model_version


@router.get("/{model_id}/versions/{version}/health")
def get_model_version_health(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    model_version = (
        db.query(ModelVersion)
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.version == version,
        )
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    if not model_version.artifact_path:
        return {
            "model_id": model_id,
            "version": version,
            "status": "unhealthy",
            "framework": model_version.framework,
            "artifact_available": False,
            "loadable": False,
            "error": "Model artifact not found",
        }

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

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
    except ValueError as exc:
        return {
            "model_id": model_id,
            "version": version,
            "status": "unhealthy",
            "framework": model_version.framework,
            "artifact_available": False,
            "loadable": False,
            "error": "Invalid stored artifact path",
        }

    if not artifact_path.is_file():
        return {
            "model_id": model_id,
            "version": version,
            "status": "unhealthy",
            "framework": model_version.framework,
            "artifact_available": False,
            "loadable": False,
            "error": "Model artifact file not found",
        }

    try:
        runtime.load(str(artifact_path))
    except Exception as exc:
        return {
            "model_id": model_id,
            "version": version,
            "status": "unhealthy",
            "framework": model_version.framework,
            "artifact_available": True,
            "loadable": False,
            "error": str(exc),
        }

    return {
        "model_id": model_id,
        "version": version,
        "status": "healthy",
        "framework": model_version.framework,
        "artifact_available": True,
        "loadable": True,
        "error": None,
    }
