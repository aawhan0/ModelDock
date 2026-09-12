# Production monitoring

ModelDock stores inference telemetry so operators can inspect how a deployed model behaves after release. Monitoring is intentionally based on persisted inference records, which keeps the dashboard and API consistent across process restarts.

## Monitoring summary

```text
GET /api/v1/metrics/{model_id}/{version}/monitoring?hours=24
```

The response reports:

- request count and successful/failed requests
- success and error rates
- average latency
- p50, p95, and p99 latency
- requests per minute for the selected window
- alert signals when configured error-rate or p95-latency thresholds are exceeded
- an overall `healthy` flag

The window is configurable from 1 to 168 hours. If omitted, `MODELDOCK_MONITORING_WINDOW_HOURS` is used.

## Prediction distribution

```text
GET /api/v1/metrics/{model_id}/{version}/predictions?hours=24&limit=50
```

This returns the successful prediction distribution, including count and share for each observed prediction. The endpoint is useful for spotting production output shifts even when labeled ground truth is not available.

## Version comparison

```text
GET /api/v1/metrics/{model_id}/compare?baseline=v1&candidate=v2&hours=24
```

The comparison returns the monitoring summary for both versions and deltas for success rate, error rate, average latency, p95/p99 latency, and throughput. Both versions must belong to the requested model.

## Drift detection

```text
GET /api/v1/metrics/{model_id}/{version}/drift?reference_size=50&window_size=50
```

Drift uses Population Stability Index (PSI) over two consecutive successful-inference windows. Numeric inputs are bucketed from the reference distribution; categorical values and predictions are compared by frequency.

The report now includes both input-feature drift and prediction-distribution drift. The default status thresholds are:

- `stable`: PSI below `MODELDOCK_MONITORING_DRIFT_MODERATE_THRESHOLD`
- `moderate_drift`: PSI at or above the moderate threshold
- `significant_drift`: PSI at or above `MODELDOCK_MONITORING_DRIFT_SIGNIFICANT_THRESHOLD`

At least `reference_size + window_size` successful records are required. The endpoint reports `insufficient_data` instead of producing a misleading score when there is not enough history.

## Operational thresholds

The following environment variables control monitoring alerts:

```text
MODELDOCK_MONITORING_WINDOW_HOURS=24
MODELDOCK_MONITORING_P95_LATENCY_MS=1000
MODELDOCK_MONITORING_ERROR_RATE_THRESHOLD=0.05
MODELDOCK_MONITORING_DRIFT_MODERATE_THRESHOLD=0.1
MODELDOCK_MONITORING_DRIFT_SIGNIFICANT_THRESHOLD=0.2
```

These are operational thresholds, not model-quality guarantees. They should be tuned to the model's normal traffic and latency profile.

All monitoring endpoints require the `metrics:read` API scope when API authentication is enabled.
