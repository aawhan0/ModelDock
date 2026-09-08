import logging
import os
import time
import uuid

from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import SessionLocal
from app.core.logging import (
    REQUEST_ID_HEADER,
    configure_logging,
    get_request_id,
    reset_request_id,
    set_request_id,
    valid_request_id,
)
from app.services.prometheus_metrics import render_prometheus_metrics

configure_logging(settings.log_level)
logger = logging.getLogger("modeldock.api")


def create_app() -> FastAPI:
    app = FastAPI(title="ModelDock API", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[os.getenv("MODELDOCK_FRONTEND_ORIGIN", settings.frontend_origin)],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.include_router(api_router)

    @app.middleware("http")
    async def request_logging_middleware(request: Request, call_next):
        request_id = request.headers.get(REQUEST_ID_HEADER)
        if not valid_request_id(request_id):
            request_id = str(uuid.uuid4())

        request.state.request_id = request_id
        token = set_request_id(request_id)
        started = time.perf_counter()
        try:
            response = await call_next(request)
            status_code = response.status_code
            response.headers[REQUEST_ID_HEADER] = request_id
            return response
        except Exception:
            status_code = 500
            raise
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.info(
                "request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": status_code,
                    "duration_ms": duration_ms,
                },
            )
            reset_request_id(token)

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

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", get_request_id())
        logger.exception("unhandled application error", extra={"path": request.url.path})
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                    "message": "Internal server error",
                    "request_id": request_id,
                }
            },
            headers={REQUEST_ID_HEADER: request_id},
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
