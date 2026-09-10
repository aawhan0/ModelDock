# ModelDock

ModelDock is a production-oriented model registry and inference platform with versioned artifacts, deployment controls, inference telemetry, experiment lineage, and operational monitoring.

## Inference and Observability

Inference requests record operational data including:

- Model and version identity
- Prediction success or failure
- Inference latency
- Persistent inference history
- Request correlation IDs for tracing individual calls

The dashboard exposes model-specific inference, history, and monitoring views.

### Production monitoring

ModelDock provides persisted monitoring analytics for deployed model versions:

- request volume, success/error rate, and throughput
- p50, p95, and p99 latency
- configurable operational alert thresholds
- prediction-frequency distributions
- version-to-version monitoring comparison
- PSI-based input and prediction drift detection
- explicit `insufficient_data` drift state rather than unreliable small-sample scores

Core monitoring endpoints are:

```text
GET /api/v1/metrics/{model_id}/{version}/monitoring?hours=24
GET /api/v1/metrics/{model_id}/{version}/predictions?hours=24&limit=50
GET /api/v1/metrics/{model_id}/compare?baseline=v1&candidate=v2&hours=24
GET /api/v1/metrics/{model_id}/{version}/drift?reference_size=50&window_size=50
```

Monitoring behavior can be tuned through `MODELDOCK_MONITORING_WINDOW_HOURS`, `MODELDOCK_MONITORING_P95_LATENCY_MS`, `MODELDOCK_MONITORING_ERROR_RATE_THRESHOLD`, `MODELDOCK_MONITORING_DRIFT_MODERATE_THRESHOLD`, and `MODELDOCK_MONITORING_DRIFT_SIGNIFICANT_THRESHOLD`.

See [`docs/production-monitoring.md`](docs/production-monitoring.md) for the response contracts and operational guidance.

## Deployment Quality Gates

ModelDock can enforce evaluation-based deployment policies per model. A policy contains minimum numeric metric thresholds such as:

```json
{
  "enabled": true,
  "minimum_metrics": {
    "accuracy": 0.90,
    "f1": 0.85
  }
}
```

When a policy is enabled, deployment is allowed only when the model version has a completed experiment run linked to it and every configured metric meets its minimum threshold. The latest completed run is used, so a newer evaluation can supersede an older result.

The core endpoints are:

```text
GET /api/v1/models/{modelId}/deployment-policy
PUT /api/v1/models/{modelId}/deployment-policy
GET /api/v1/models/{modelId}/versions/{version}/deployment-readiness
```

Deployments record the decision context in the deployment audit trail, while the readiness endpoint can be used by a CI/CD promotion step without mutating deployment state.

The readiness endpoint provides the evaluated run, observed metrics, and human-readable failures without changing deployment state. This makes the same gate usable by CI/CD or an external promotion service before calling the deployment endpoint.

A disabled or absent policy preserves the existing deployment lifecycle. Readiness evaluation is non-mutating, so CI/CD systems can check promotion eligibility before calling the deployment endpoint.

## Experiment Lineage

ModelDock now tracks the path from training data and run metadata to a registered model version.

The experiment layer provides:

- Versioned dataset records with optional source URIs and descriptions
- Experiments with explicit lifecycle status
- Training-run records with hyperparameters and evaluation metrics
- Optional links from a run to a ModelDock model version and dataset
- A model-version lineage endpoint that groups the experiments and runs that produced a version

The core endpoints are:

```text
POST  /api/v1/datasets
GET   /api/v1/datasets
POST  /api/v1/experiments
GET   /api/v1/experiments
PATCH /api/v1/experiments/{experimentId}
POST  /api/v1/experiments/{experimentId}/runs
GET   /api/v1/experiments/{experimentId}/runs
PATCH /api/v1/runs/{runId}
GET   /api/v1/experiments/lineage/model-versions/{modelId}/{version}
```

This is metadata and lineage infrastructure rather than a training engine: external training jobs can record their inputs, parameters, metrics, and resulting ModelDock version without forcing ModelDock to own the training stack.
