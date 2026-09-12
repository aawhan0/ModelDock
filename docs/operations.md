# Production operations

ModelDock exposes lightweight operational signals for containerized deployments.

## Health and readiness

ModelDock provides separate backend endpoints for liveness and readiness probes:

### Liveness endpoint (`GET /health`)

- **Description**: Lightweight liveness check to confirm that the backend API process is running and accepting HTTP requests. It does not require or query the database or external services.
- **HTTP Status**: `200 OK`
- **Example Response**:
  ```json
  {
    "status": "ok"
  }
  ```

### Readiness endpoint (`GET /ready`)

- **Description**: Readiness check to verify that all required backend dependencies (PostgreSQL database and Redis) are available to serve requests. It performs a lightweight database query (`SELECT 1`) and a Redis ping check.
- **HTTP Status**:
  - `200 OK` when all required dependencies are healthy.
  - `503 Service Unavailable` when any required dependency is unavailable.
- **Example Response (Healthy)**:
  ```json
  {
    "status": "ready",
    "checks": {
      "database": "ok",
      "redis": "ok"
    }
  }
  ```
- **Example Response (Dependency Failure / Unhealthy)**:
  ```json
  {
    "status": "not_ready",
    "checks": {
      "database": "unavailable",
      "redis": "ok"
    }
  }
  ```

- Production backend and frontend images include Docker health checks using `/ready`.
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
