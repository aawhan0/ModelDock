import hashlib
import os
import secrets

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.api_key import APIKey

api_key_header = APIKeyHeader(name="Authorization", auto_error=False)


def _auth_enabled() -> bool:
    return os.getenv("MODELDOCK_API_AUTH_ENABLED", "false").lower() in {"1", "true", "yes"}


def _admin_api_key() -> str | None:
    return os.getenv("MODELDOCK_ADMIN_API_KEY")


def _hash_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_api_key() -> str:
    return f"md_{secrets.token_urlsafe(32)}"


def create_stored_key(db: Session, name: str) -> tuple[APIKey, str]:
    raw_key = generate_api_key()
    record = APIKey(name=name, key_hash=_hash_key(raw_key), key_prefix=raw_key[:11])
    db.add(record)
    db.commit()
    db.refresh(record)
    return record, raw_key


def require_api_key(
    authorization: str | None = Security(api_key_header),
    db: Session = Depends(get_db),
) -> APIKey | None:
    if not _auth_enabled():
        return None

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    raw_key = authorization.removeprefix("Bearer ").strip()
    if not raw_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing API key")

    admin_key = _admin_api_key()
    if admin_key and secrets.compare_digest(raw_key, admin_key):
        return None

    key = db.scalar(select(APIKey).where(APIKey.key_hash == _hash_key(raw_key), APIKey.is_active.is_(True)))
    if key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return key
