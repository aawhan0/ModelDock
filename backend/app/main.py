import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal


def create_app() -> FastAPI:
    app = FastAPI(title="ModelDock API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[os.getenv("MODELDOCK_FRONTEND_ORIGIN", settings.frontend_origin)],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    def ready() -> dict[str, str]:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        except Exception:
            return {"status": "not_ready"}
        finally:
            db.close()
        return {"status": "ready"}

    return app


app = create_app()
