from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.services.artifact_store import LocalArtifactStore
from app.services.model_loader import ModelLoader

router = APIRouter(prefix="/models", tags=["inference"])
artifact_store = LocalArtifactStore()
model_loader = ModelLoader()


class PredictionRequest(BaseModel):
    input: Any


class PredictionResponse(BaseModel):
    model: str
    version: str
    prediction: Any


@router.post(
    "/{model_id}/versions/{version}/predict",
    response_model=PredictionResponse,
)
def predict(
    model_id: int,
    version: str,
    payload: PredictionRequest,
    db: Session = Depends(get_db),
) -> PredictionResponse:
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
        raise HTTPException(status_code=404, detail="Model artifact not found")

    try:
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        loaded_model = model_loader.load(str(artifact_path))
        prediction = loaded_model(payload.input)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Model artifact not found") from exc
    except (ValueError, TypeError, SyntaxError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Model inference failed") from exc

    return PredictionResponse(
        model=model.name,
        version=model_version.version,
        prediction=prediction,
    )
