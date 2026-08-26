from fastapi import APIRouter, Depends

from app.api.artifacts import router as artifacts_router
from app.api.auth import router as auth_router
from app.api.inference import router as inference_router
from app.api.metrics import router as metrics_router
from app.api.models import router as models_router
from app.core.security import require_api_key

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth_router)
protected_router = APIRouter(dependencies=[Depends(require_api_key)])
protected_router.include_router(models_router)
protected_router.include_router(artifacts_router)
protected_router.include_router(inference_router)
protected_router.include_router(metrics_router)
api_router.include_router(protected_router)
