import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Security, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import api_key_header, create_stored_key
from app.models.api_key import APIKey
from app.schemas.auth import APIKeyCreate, APIKeyCreated, APIKeyRead

router = APIRouter(prefix="/auth", tags=["auth"])


def require_admin_key(authorization: str | None = Security(api_key_header)) -> None:
    admin_key = os.getenv("MODELDOCK_ADMIN_API_KEY")
    if not admin_key:
        raise HTTPException(status_code=503, detail="API key administration is not configured")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing admin API key")
    if not secrets.compare_digest(authorization.removeprefix("Bearer ").strip(), admin_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin API key required")


@router.post("/keys", response_model=APIKeyCreated, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin_key)])
def create_api_key(payload: APIKeyCreate, db: Session = Depends(get_db)) -> APIKeyCreated:
    record, raw_key = create_stored_key(db, payload.name)
    return APIKeyCreated.model_validate({**record.__dict__, "key": raw_key})


@router.get("/keys", response_model=list[APIKeyRead], dependencies=[Depends(require_admin_key)])
def list_api_keys(db: Session = Depends(get_db)) -> list[APIKey]:
    return list(db.scalars(select(APIKey).order_by(APIKey.id)).all())


@router.delete("/keys/{key_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin_key)])
def revoke_api_key(key_id: int, db: Session = Depends(get_db)) -> None:
    record = db.get(APIKey, key_id)
    if record is None:
        raise HTTPException(status_code=404, detail="API key not found")
    record.is_active = False
    db.commit()
