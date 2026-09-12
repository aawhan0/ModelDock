# ModelDock

> **Self-hostable ML model serving platform for model versioning, deployment, inference, benchmarking, and observability.**

![ModelDock Preview](docs/modeldock-preview.png)

ModelDock is a full-stack ML infrastructure project for taking model artifacts from registration to controlled inference and governed promotion. It provides model versioning, artifact integrity verification, pluggable runtimes, deployment lifecycle management, deployment audit history, experiment lineage, evaluation-based deployment gates, runtime caching, inference history, metrics, authentication, rate limiting, and a web dashboard.

## Highlights

- **Model registry** with versioned model management
- **Artifact management** with upload, replacement, validation, SHA-256 integrity verification, size limits, and filename normalization
- **Multiple runtimes** for Python, JSON, and scikit-learn artifacts
- **Explicit deployment lifecycle** with deploy, undeploy, rollback, retirement, deployment audit history, and evaluation gates
- **Deployment audit trail** recording deployment transitions and rollback history
- **Inference API** with version-aware prediction requests
- **Runtime caching** with safe artifact replacement invalidation
- **Restricted Python execution** with import, dunder, and unsafe builtin checks
- **Authentication** with configurable API key protection
- **Metrics and inference history** for operational visibility, including PSI-based data drift
- **Dockerized development** with PostgreSQL and Redis
- **Next.js dashboard** for models, inference, history, and monitoring
- **Automated CI/CD** for tests, compilation, builds, migrations, security scanning, container validation, and release images

## Architecture

![ModelDock architecture](docs/diagrams/architecture.png)

## Model Lifecycle

![ModelDock model lifecycle](docs/diagrams/model-lifecycle.png)

Key rules:

1. Uploading or replacing an artifact returns the version to a validated state.
2. A version must be deployed before it can receive inference traffic.
3. Deploying a new version retires the previously deployed version for that model.
4. Replacing an artifact invalidates its cached runtime after the database change commits.
5. A deployment quality gate can require a completed evaluation run and minimum metric thresholds before promotion.
6. Undeployed versions reject prediction requests.

## Runtime System

ModelDock uses a runtime registry and a common runtime contract so the API does not depend on individual model formats.

### Python

Python artifacts expose a callable named `model`.

Before execution, the runtime applies a restricted policy that includes:

- Import blocking
- Dunder name and attribute blocking
- Unsafe builtin blocking
- Restricted builtin namespace
- Source validation before execution

This is an intentionally restricted execution layer, not a complete sandbox for hostile arbitrary Python.

### JSON

Supports deterministic JSON-based prediction mappings.

```json
{
  "predictions": {
    "hello": "positive",
    "goodbye": "negative"
  }
}
```

### scikit-learn

Loads serialized scikit-learn-compatible models and validates the expected prediction interface.

## Runtime Caching

Loaded runtime instances are cached to avoid repeatedly loading the same artifact.

When an artifact changes:

![ModelDock runtime cache invalidation flow](docs/diagrams/runtime-cache.png)

Cache invalidation is tied to the persistence flow so a failed artifact replacement does not leave cache state inconsistent.

## Security and Artifact Handling

ModelDock treats uploaded artifacts as untrusted application input.

Controls include:

- API key authentication
- Configurable CORS origins
- Artifact path and file validation
- Configurable maximum artifact size
- Filename normalization
- Runtime-specific validation
- Restricted Python source checks
- Explicit deployment state
- Deployment audit history for deploy, undeploy, rollback, and related transitions
- Model artifact integrity verification using persisted SHA-256 digests
- Redis-backed API rate limiting with configurable limits and fail-open behavior
- Security response headers for browser-facing clients

API rate limiting is enabled by default for `/api/v1` routes. The default limit is 60 requests per client per 60-second window. Health, readiness, and Prometheus metrics endpoints are excluded so operational checks are not blocked.

Rate limiting uses Redis as shared state across backend instances. If Redis becomes temporarily unavailable, ModelDock fails open by default so a Redis outage does not take down the API. Set `MODELDOCK_RATE_LIMIT_FAIL_OPEN=false` when availability of the rate limiter should take precedence over API availability.

For non-local environments, keep authentication enabled and store secrets outside source control.

API keys support least-privilege capability scopes. Newly created keys receive the full scope set by default, or an explicit subset can be supplied when creating a key:

```json
{
  "name": "monitoring-client",
  "scopes": ["metrics:read"]
}
```

Available scopes are `models:manage`, `artifacts:manage`, `inference:execute`, `metrics:read`, and `experiments:manage`. Administrators can change a key's scopes with `PATCH /api/v1/auth/keys/{keyId}` or revoke it with `DELETE /api/v1/auth/keys/{keyId}`. Existing keys are migrated with the full scope set so the capability layer is backward-compatible.

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

## Inference and Observability

Inference requests record operational data including:

- Model and version identity
- Prediction success or failure
- Inference latency
- Inference history
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

See [`docs/production-monitoring.md`](docs/production-monitoring.md) for response contracts and operational guidance.

## API

The backend provides endpoints for:

- Model and version registration
- Model metadata editing (rename, task, description)
- Artifact upload and replacement
- Deployment, undeployment, rollback, deployment history, and deployment readiness
- Prediction and bounded batch prediction
- Health checks
- Metrics, monitoring analytics, and data drift per deployed version
- Inference history and request correlation lookup
- API key management and scoped capabilities
- Experiment, run, dataset, and lineage management
- Deployment policy and readiness evaluation

Prediction requests use:

```text
/api/v1/models/{modelId}/versions/{version}/predict
```

Batch prediction uses:

```text
POST /api/v1/models/{modelId}/versions/{version}/predict/batch
```

A Prometheus-compatible metrics endpoint is also available at `/metrics` for scraping (unauthenticated, like `/health`).

The FastAPI application also provides interactive OpenAPI documentation.

Frontend routes include:

```text
/models/{modelId}
/inference/{modelId}/{version}
/history/{modelId}/{version}
/monitoring/{modelId}/{version}
```

## Run Locally

### Requirements

- Docker
- Docker Compose
- Git

### Setup

```powershell
git clone https://github.com/aawhan0/ModelDock.git
cd ModelDock
Copy-Item .env.example .env
docker compose up -d
docker compose exec backend alembic upgrade head
docker compose ps
```

Configure the environment values in `.env` before using the application outside local development.

## Run Your First Prediction

This example registers a model, uploads a minimal JSON runtime artifact, deploys it, and calls the predict endpoint. Run each command from a shell with `curl` available, against a local ModelDock instance (`http://localhost:8000`).

Replace `YOUR_ADMIN_API_KEY` with the `MODELDOCK_ADMIN_API_KEY` value from your `.env` file. All authenticated requests use `Authorization: Bearer <key>`.

1. Create a model:

```bash
curl -X POST http://localhost:8000/api/v1/models \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "greeting-model", "task": "text-classification"}'
```

Note the returned `id` — use it as `MODEL_ID` below.

2. Create a version using the `json` runtime:

```bash
curl -X POST http://localhost:8000/api/v1/models/MODEL_ID/versions \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": "v1", "framework": "json"}'
```

3. Upload a minimal artifact. Save this as `model.json`:

```json
{
  "predictions": {
    "hello": "positive"
  }
}
```

Then upload it:

```bash
curl -X POST http://localhost:8000/api/v1/models/MODEL_ID/versions/v1/artifact \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -F "file=@model.json"
```

4. Deploy the version:

```bash
curl -X POST http://localhost:8000/api/v1/models/MODEL_ID/versions/v1/deploy \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY"
```

5. Run the prediction:

```bash
curl -X POST http://localhost:8000/api/v1/models/MODEL_ID/versions/v1/predict \
  -H "Authorization: Bearer YOUR_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "hello"}'
```

Replace `MODEL_ID` with the numeric ID from step 1. A successful response returns `"prediction": "positive"`.

## Verification

### Backend

```powershell
docker compose exec backend pytest -q
docker compose exec backend python -m compileall -q app
```

### Frontend

```powershell
docker compose exec frontend npm run typecheck
docker compose exec frontend npm run build
```

Current CI baseline: **120+ backend tests** with backend coverage in the mid-80% range. CI is the authoritative verification path for the latest merged state.

## CI/CD

GitHub Actions validates every pull request and every change merged to `main`.

CI covers:

- Repository hygiene, workflow validation, and Dockerfile linting
- Backend dependency checks, migrations, compilation, tests, and coverage
- Frontend dependency audit, type checking, and production build
- Development Docker smoke tests and production-image builds
- Dependency Review, secret scanning, and CodeQL

Tagged releases use:

```text
.github/workflows/release.yml
```

A release tag such as `v0.6.0` automatically:

1. Validates the production backend and frontend images.
2. Publishes versioned container images to GitHub Container Registry.
3. Publishes an image tag tied to the source commit for reproducibility.
4. Creates a GitHub Release with generated release notes.

Before publishing a release, configure the repository variable `MODELDOCK_PUBLIC_API_URL`. This value is baked into the Next.js frontend image at build time.

Published images:

```text
ghcr.io/aawhan0/modeldock/backend:<version>
ghcr.io/aawhan0/modeldock/frontend:<version>
```

The release workflow publishes artifacts; deployment to a specific hosting provider is intentionally kept separate so ModelDock can remain self-hostable.

## Project Structure

```text
ModelDock/
├── .github/workflows/ci.yml
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/runtimes/
│   └── tests/
├── frontend/
├── docs/
│   └── diagrams/
│       ├── architecture.png
│       ├── model-lifecycle.png
│       ├── runtime-cache.png
│       └── ci-pipeline.png
├── docker-compose.yml
├── .env.example
└── README.md
```

## Tech Stack

| Layer | Technologies |
| --- | --- |
| Backend | Python, FastAPI, SQLAlchemy, Alembic, Pydantic, Pytest |
| Frontend | Next.js, React, TypeScript |
| Infrastructure | Docker, Docker Compose, PostgreSQL, Redis |
| ML runtimes | Python, JSON, scikit-learn, Joblib |
| CI | GitHub Actions |

## Engineering Focus

ModelDock is built around a few practical infrastructure principles:

- **Explicit state:** registration, validation, deployment, and retirement are separate concerns.
- **Runtime abstraction:** model loading is isolated from API logic.
- **Cache correctness:** artifact changes invalidate affected runtime state safely.
- **Persistent telemetry:** inference behavior is stored instead of kept only in memory.
- **Defensive artifact handling:** uploaded model files are validated before execution.
- **Automated verification:** backend and frontend checks run locally and in CI.
- **Promotion safety:** deployment can be gated by evaluation metrics instead of relying only on manual state changes.
- **Operational auditability:** deployment transitions and rollback actions are persisted for investigation.

## Contributing

ModelDock is open to contributions from developers, students, and ML practitioners.

New to the project? Start with the [New contributors start here](https://github.com/aawhan0/ModelDock/issues/12) guide, then pick an open [good first issue](https://github.com/aawhan0/ModelDock/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22).

Before opening a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md). The repository runs automated backend and frontend checks on pull requests.

## Author

### Aawhan Vyas

AI engineering, backend systems, full-stack development, and practical ML infrastructure.

- **LinkedIn:** [Aawhan Vyas](https://www.linkedin.com/in/aawhanvyas/)
- **GitHub:** [aawhan0](https://github.com/aawhan0)
