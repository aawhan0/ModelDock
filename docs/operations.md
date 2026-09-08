# Production operations

ModelDock exposes lightweight operational signals for containerized deployments.

## Health and readiness

- `GET /health` is a liveness check. It confirms that the API process is serving requests and does not require the database.
- `GET /ready` is a readiness check. It executes a small database query and returns HTTP 503 when the database is unavailable.
- Production backend and frontend images include Docker health checks.
- The Compose stack waits for PostgreSQL and Redis health before starting the backend, and waits for backend health before starting the frontend.

Keep liveness and readiness separate when wiring these endpoints into an orchestrator. A temporary database outage should not be treated as a dead application process.

## Request correlation

Every HTTP response includes an `X-Request-ID` header.

If a caller supplies a short, validated `X-Request-ID`, ModelDock preserves it. Otherwise, the API generates a UUID. The same ID is attached to application logs and to sanitized 500 responses.

Example:

```text
X-Request-ID: deploy-check-42
```

Do not put secrets, access tokens, or user data into request IDs.

## Structured logs

Backend logs are emitted as one JSON object per line. Request completion entries include:

- timestamp
- level
- logger
- request_id
- method
- path
- status_code
- duration_ms

Unhandled exceptions are logged with the server-side exception details, while the client receives only a generic 500 message and the request ID.

Set the backend log level with `MODELDOCK_LOG_LEVEL`. Supported values are `DEBUG`, `INFO`, `WARNING`, `ERROR`, and `CRITICAL`. The default is `INFO`.

## Container behavior

Production images run as non-root users and expose Docker health checks. Uvicorn receives SIGTERM for normal container shutdown.

The CI Docker smoke job builds both production images and waits for their Docker health checks to become healthy, so image-level health regressions are caught before merge.
