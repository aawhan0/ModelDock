# Inference request tracking

ModelDock assigns every inference request a UUID correlation identifier and every successful prediction a persistent prediction ID.

## Request IDs

Clients can provide `X-Request-ID` on single or batch inference requests. If omitted, ModelDock generates a UUID.

Single prediction responses include:

- `request_id`: correlation identifier for the request
- `prediction_id`: persistent inference metric ID
- `latency_ms`: measured request latency

Batch responses include a batch-level `request_id`, plus independent request and prediction IDs for each item.

Request IDs are persisted and cannot be reused. Reusing an ID returns `409 Conflict` so a client does not accidentally correlate two different inference operations to the same trace.

## Request lookup

Use the metrics scope to retrieve a request record:

```text
GET /api/v1/metrics/requests/{request_id}
```

The response includes the model/version, endpoint, success state, latency, and linked prediction metric ID.

This gives operators a stable path from an application log or client trace ID to the persisted inference history.

## Asynchronous inference jobs

Longer-running predictions can be submitted without keeping the HTTP request open:

```text
POST /api/v1/models/{model_id}/versions/{version}/predict/async
GET  /api/v1/models/inference-jobs/{job_id}
```

The submission returns `202 Accepted` with a stable `job_id`. The optional `Idempotency-Key` is scoped to asynchronous jobs; submitting the same key and payload returns the original job, while reusing it for a different payload returns `409 Conflict`.

Jobs move through `queued`, `running`, and `completed`, or end in `failed`. A completed job exposes `result.prediction`, `result.prediction_id`, and latency. A failed job exposes only a safe structured `error` with an HTTP-style code and message; request input is never returned by the status endpoint. Jobs run in a bounded in-process executor and use a fresh database session, so this initial implementation is intended for a single backend node. Run the latest Alembic migrations before enabling the endpoint.

Asynchronous job totals are available from the unauthenticated Prometheus endpoint as `modeldock_inference_jobs_total{status="queued|running|completed|failed"}`.
