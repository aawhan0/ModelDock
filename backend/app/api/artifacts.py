import logging
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

from app.core.security import require_scope
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore, artifact_sha256
from app.services.runtime_registry import runtime_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models", tags=["artifacts"], dependencies=[Depends(require_scope("artifacts:manage"))])
artifact_store = LocalArtifactStore()


@router.post(
    "/{model_id}/versions/{version}/artifact",
    status_code=status.HTTP_201_CREATED,
)
async def upload_artifact(
    model_id: int,
    version: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> dict[str, str]:
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

    if model_version.status == "deployed":
        raise HTTPException(status_code=409, detail="Cannot replace an artifact while its version is deployed")

    try:
        runtime = runtime_registry.get(model_version.framework)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    content = await file.read(settings.max_artifact_size_bytes + 1)
    if not content:
        raise HTTPException(status_code=422, detail="Artifact file is empty")
    if len(content) > settings.max_artifact_size_bytes:
        raise HTTPException(status_code=413, detail="Artifact file exceeds the maximum allowed size")

    filename = Path(file.filename or "artifact").name
    if not filename:
        raise HTTPException(status_code=422, detail="Artifact filename is required")

    artifact_store.root.mkdir(parents=True, exist_ok=True)
    temporary_path = artifact_store.root / f".validation-{uuid4().hex}.artifact"
    try:
        temporary_path.write_bytes(content)
        runtime.load(str(temporary_path))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=422, detail="Artifact file could not be loaded") from exc
    except (ValueError, TypeError, SyntaxError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {model_version.framework} artifact: {exc}") from exc
    except Exception:
        logger.exception("Artifact validation failed for model %s version %s", model_id, version)
        raise HTTPException(status_code=422, detail="Unable to validate artifact") from None
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass

    old_artifact_path = model_version.artifact_path
    path = artifact_store.save(model.name, version, filename, content)
    model_version.artifact_path = path
    model_version.artifact_sha256 = artifact_sha256(content)
    model_version.artifact_size_bytes = len(content)
    model_version.status = "validated"

    try:
        db.commit()
        db.refresh(model_version)
    except Exception:
        db.rollback()
        try:
            new_path = artifact_store.resolve(path)
            if new_path.is_file():
                new_path.unlink()
        except (ValueError, OSError):
            pass
        raise

    if old_artifact_path:
        try:
            old_path = artifact_store.resolve(old_artifact_path)
            runtime.clear_artifact(str(old_path))
        except (ValueError, OSError):
            pass

        try:
            old_path = artifact_store.resolve(old_artifact_path)
            if old_path.is_file():
                old_path.unlink()
        except (ValueError, OSError):
            pass

    return {"artifact_path": path}


@router.get("/{model_id}/versions/{version}/artifact")
def download_artifact(
    model_id: int,
    version: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    model = db.get(Model, model_id)
    if model is None:
        raise HTTPException(status_code=404, detail="Model not found")

    model_version = (
        db.query(ModelVersion)
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    if not model_version.artifact_path:
        raise HTTPException(status_code=404, detail="Artifact not found")

    try:
        path = artifact_store.resolve(model_version.artifact_path)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Invalid stored artifact path") from exc

    if not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact file not found")

    return FileResponse(path=path, filename=path.name, media_type="application/octet-stream")
