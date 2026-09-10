# API compatibility policy

ModelDock exposes its application API under `/api/v1`.

## Compatibility rules

Within a major API version:

- Existing endpoint paths and HTTP methods are treated as public contract.
- Existing successful response fields are not removed without a version change.
- Existing error envelope fields remain stable: `error.code` and `error.message`.
- Request and response changes should be additive when practical.
- Authentication, rate-limit, request-correlation, and idempotency headers are part of the serving contract where documented.

A breaking change should use a new API version rather than silently changing `/api/v1` behavior.

## Operational headers

Inference clients may use:

- `X-Request-ID` to correlate a request with logs and persistent inference telemetry.
- `Idempotency-Key` when the same logical inference request may be retried and should replay the original response rather than execute the model again.

`X-Request-ID` is correlation only. It does not provide idempotency.

## Contract verification

The backend CI suite validates the versioned API surface through `backend/tests/test_api_contract.py`. The contract test intentionally checks critical paths and inference headers rather than snapshotting the entire generated OpenAPI document, so harmless schema metadata changes do not create unnecessary release friction.

The generated OpenAPI document remains available from the running service at `/openapi.json` and is the source of truth for request and response schemas.
