from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore
from app.services.runtime_registry import runtime_registry

router = APIRouter(prefix="/models", tags=["artifacts"])
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

    try:
        runtime = runtime_registry.get(model_version.framework)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    content = await file.read()
    if not content:
        raise HTTPException(status_code=422, detail="Artifact file is empty")

    filename = file.filename or "artifact"

    # Validate the artifact before storing it.
    artifact_store.root.mkdir(parents=True, exist_ok=True)
    temporary_path = artifact_store.root / f".validation-{filename}"
    try:
        temporary_path.write_bytes(content)
        runtime.load(str(temporary_path))
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=422,
            detail="Artifact file could not be loaded",
        ) from exc
    except (ValueError, TypeError, SyntaxError) as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid {model_version.framework} artifact: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Unable to validate artifact: {exc}",
        ) from exc
    finally:
        try:
            temporary_path.unlink()
        except FileNotFoundError:
            pass

    old_artifact_path = model_version.artifact_path

    # If replacing an existing artifact, evict its loaded runtime first.
    if old_artifact_path:
        try:
            old_path = artifact_store.resolve(old_artifact_path)
            runtime.clear_artifact(str(old_path))
        except (ValueError, OSError):
            pass

    path = artifact_store.save(
        model.name,
        version,
        filename,
        content,
    )

    model_version.artifact_path = path
    db.commit()

    # Remove the previous physical artifact after the new one is committed.
    if old_artifact_path:
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
        .filter(
            ModelVersion.model_id == model_id,
            ModelVersion.version == version,
        )
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    if not model_version.artifact_path:
        raise HTTPException(status_code=404, detail="Artifact not found")

    try:
        path = artifact_store.resolve(model_version.artifact_path)
    except ValueError as exc:
        raise HTTPException(
            status_code=500,
            detail="Invalid stored artifact path",
        ) from exc

    if not path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Artifact file not found",
        )

    return FileResponse(
        path=path,
        filename=path.name,
        media_type="application/octet-stream",
    )
