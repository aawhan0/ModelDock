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
