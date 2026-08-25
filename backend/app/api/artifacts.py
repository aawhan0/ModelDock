from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore

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
        .filter(ModelVersion.model_id == model_id, ModelVersion.version == version)
        .first()
    )
    if model_version is None:
        raise HTTPException(status_code=404, detail="Model version not found")

    content = await file.read()
    path = artifact_store.save(model.name, version, file.filename or "artifact", content)
    model_version.artifact_path = path
    db.commit()

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
