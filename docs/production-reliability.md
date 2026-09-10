# Production reliability

ModelDock bounds inference work at the API boundary and keeps request execution observable and replay-safe.

## Request limits

Inference requests are rejected with `413` when their declared HTTP payload exceeds `MODELDOCK_MAX_INFERENCE_PAYLOAD_BYTES`. The default is 1 MiB. Batch inputs remain separately bounded by `MODELDOCK_MAX_BATCH_SIZE` and are validated with a hard application cap of 1000 items.

The payload guard intentionally runs before model execution. Deployments should also enforce equivalent body-size limits at the reverse proxy or ingress so requests without a `Content-Length` header are bounded before reaching the application process.

## Execution timeout

Model loading and prediction execution are bounded by `MODELDOCK_INFERENCE_TIMEOUT_SECONDS`, defaulting to 30 seconds. A timeout returns HTTP `504` and is recorded as a failed inference metric.

The timeout bounds the request's wait time. Python work already running in a worker thread is not forcibly killed, so models that regularly exceed the limit should be isolated at the process/container level rather than relying on cooperative cancellation.

## Idempotency

Clients can send an `Idempotency-Key` on single or batch prediction requests. The server hashes the model, version, and canonical request body and stores the resulting response.

- Repeating the same key and same request returns the original response without executing the model again.
- Reusing a key with a different request returns `409`.
- A concurrent request that reaches an already-reserved key returns `409` while the first request is in progress.
- Completed reservations are replayable for `MODELDOCK_IDEMPOTENCY_TTL_SECONDS`, default 24 hours. Stale reservations are eligible for reuse.

`X-Request-ID` remains a correlation identifier. It is not a substitute for `Idempotency-Key`.

## Operational guidance

For production deployments, combine the application controls with ingress request-size limits, container CPU/memory limits, worker/process isolation, and an external load test. Start with conservative timeout and batch-size values, then raise them only after measuring p95/p99 latency and error behavior under realistic concurrency.
