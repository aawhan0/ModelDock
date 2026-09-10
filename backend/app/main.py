from contextlib import asynccontextmanager
import logging
import os
import time
import uuid

import redis.asyncio as redis
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
from app.core.rate_limit import RateLimiter
from app.services.prometheus_metrics import render_prometheus_metrics

configure_logging(settings.log_level)
logger = logging.getLogger("modeldock.api")

_RATE_LIMIT_EXCLUDED_PATHS = {"/health", "/ready", "/metrics"}
_INFERENCE_PATH_MARKER = "/predict"


@asynccontextmanager
async def _lifespan(app: FastAPI):
    try:
        yield
    finally:
        if app.state.rate_limit_redis_owned:
            await app.state.rate_limit_redis.aclose()


def create_app(redis_client: redis.Redis | None = None) -> FastAPI:
    app = FastAPI(title="ModelDock API", version="0.1.0", lifespan=_lifespan)

    if redis_client is None:
        redis_client = redis.from_url(
            settings.rate_limit_redis_url,
            decode_responses=True,
            socket_connect_timeout=1,
            socket_timeout=1,
        )
        app.state.rate_limit_redis_owned = True
    else:
        app.state.rate_limit_redis_owned = False

    app.state.rate_limit_redis = redis_client
    app.state.rate_limiter = RateLimiter(
        redis_client,
        limit=settings.rate_limit_requests,
        window_seconds=settings.rate_limit_window_seconds,
        fail_open=settings.rate_limit_fail_open,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", REQUEST_ID_HEADER, "Idempotency-Key"],
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
                    "request_id": request_id,
                },
            )
            reset_request_id(token)

    @app.middleware("http")
    async def request_size_middleware(request: Request, call_next):
        if request.method == "POST" and request.url.path.startswith("/api/v1") and _INFERENCE_PATH_MARKER in request.url.path:
            raw_length = request.headers.get("content-length")
            if raw_length:
                try:
                    content_length = int(raw_length)
                except ValueError:
                    return JSONResponse(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        content={"error": {"code": 400, "message": "Invalid Content-Length header"}},
                    )
                if content_length > settings.max_inference_payload_bytes:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={
                            "error": {
                                "code": status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                "message": "Inference request payload exceeds configured limit",
                            }
                        },
                        headers={"Retry-After": "0"},
                    )
        return await call_next(request)

    @app.middleware("http")
    async def rate_limit_middleware(request: Request, call_next):
        if (
            settings.rate_limit_enabled
            and request.url.path.startswith("/api/v1")
            and request.url.path not in _RATE_LIMIT_EXCLUDED_PATHS
        ):
            client_host = request.client.host if request.client else "unknown"
            result = await app.state.rate_limiter.check(client_host)

            headers = {
                "X-RateLimit-Limit": str(result.limit),
                "X-RateLimit-Remaining": str(result.remaining),
                "X-RateLimit-Reset": str(result.retry_after),
            }
            if not result.allowed:
                headers["Retry-After"] = str(result.retry_after)
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": {
                            "code": status.HTTP_429_TOO_MANY_REQUESTS,
                            "message": "Rate limit exceeded",
                        }
                    },
                    headers=headers,
                )

            response = await call_next(request)
            for name, value in headers.items():
                response.headers[name] = value
            return response

        return await call_next(request)

    @app.middleware("http")
    async def security_headers_middleware(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault(
            "Permissions-Policy",
            "camera=(), microphone=(), geolocation=(), payment=()",
        )
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        return response

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

    @app.get("/ready", response_model=None)
    async def ready() -> dict[str, object] | JSONResponse:
        checks: dict[str, str] = {"database": "ok", "redis": "ok"}
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
        except Exception:
            checks["database"] = "unavailable"
        finally:
            db.close()

        try:
            await app.state.rate_limit_redis.ping()
        except Exception:
            checks["redis"] = "unavailable"

        if any(value != "ok" for value in checks.values()):
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"status": "not_ready", "checks": checks},
            )
        return {"status": "ready", "checks": checks}

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
