import os

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import status
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.services.prometheus_metrics import render_prometheus_metrics


def create_app() -> FastAPI:
    app = FastAPI(title="ModelDock API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[os.getenv("MODELDOCK_FRONTEND_ORIGIN", settings.frontend_origin)],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(api_router)

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.status_code, "message": str(exc.detail)}},
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": 422,
                    "message": "Request validation failed",
                    "details": jsonable_encoder(exc.errors()),
                }
            },
        )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/ready")
    def ready() -> dict[str, str]:
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        except Exception:
            return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content={"status": "not_ready"})
        finally:
            db.close()
        return {"status": "ready"}

    @app.get("/metrics", include_in_schema=False)
    def prometheus_metrics() -> Response:
        db = SessionLocal()
        try:
            body = render_prometheus_metrics(db)
        finally:
            db.close()
        return Response(content=body, media_type="text/plain; version=0.0.4; charset=utf-8")

    return app


app = create_app()
