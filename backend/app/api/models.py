from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.model import Model, ModelVersion
from app.schemas.model import ModelCreate, ModelRead, ModelVersionCreate, ModelVersionRead

router = APIRouter(prefix="/models", tags=["models"])


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
