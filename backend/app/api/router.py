from fastapi import APIRouter

from app.api.artifacts import router as artifacts_router
from app.api.inference import router as inference_router
from app.api.models import router as models_router

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(models_router)
api_router.include_router(artifacts_router)
api_router.include_router(inference_router)
