import os
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.api_key import APIKey

api_key_header = APIKeyHeader(name="Authorization", auto_error=False)

FULL_API_KEY_SCOPES = (
    "models:manage",
    "artifacts:manage",
    "inference:execute",
    "metrics:read",
    "experiments:manage",
)
_password_hasher = PasswordHasher()


def _auth_enabled() -> bool:
    return os.getenv("MODELDOCK_API_AUTH_ENABLED", "true").lower() in {"1", "true", "yes"}


def _admin_api_key() -> str | None:
    return os.getenv("MODELDOCK_ADMIN_API_KEY")


def _hash_key(raw_key: str) -> str:
    return _password_hasher.hash(raw_key)


def _verify_key(stored_hash: str, raw_key: str) -> bool:
    try:
        return _password_hasher.verify(stored_hash, raw_key)
    except (VerifyMismatchError, InvalidHashError):
        return False


def generate_api_key() -> str:
    return f"md_{secrets.token_urlsafe(32)}"


def create_stored_key(db: Session, name: str) -> tuple[APIKey, str]:
    raw_key = generate_api_key()
    record = APIKey(
        name=name,
        key_hash=_hash_key(raw_key),
        key_prefix=raw_key[:11],
        scopes=list(FULL_API_KEY_SCOPES),
    )
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

    prefix = raw_key[:11]
    candidates = db.scalars(
        select(APIKey).where(APIKey.key_prefix == prefix, APIKey.is_active.is_(True))
    ).all()
    for key in candidates:
        if _verify_key(key.key_hash, raw_key):
            if _password_hasher.check_needs_rehash(key.key_hash):
                key.key_hash = _hash_key(raw_key)
                db.commit()
            return key

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


def require_scope(scope: str):
    """Require an authenticated stored key to have a specific capability."""
    if scope not in FULL_API_KEY_SCOPES:
        raise ValueError(f"Unknown API key scope: {scope}")

    def dependency(api_key: APIKey | None = Depends(require_api_key)) -> APIKey | None:
        if api_key is None:
            return None
        if scope not in (api_key.scopes or []):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"API key lacks required scope: {scope}",
            )
        return api_key

    return dependency
