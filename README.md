# ModelDock

> **Self-hostable ML model serving platform for model versioning, deployment, inference, benchmarking, and observability.**

![ModelDock Preview](docs/modeldock-preview.png)

ModelDock is a full-stack ML infrastructure project for taking model artifacts from registration to controlled inference. It provides model versioning, artifact validation, pluggable runtimes, deployment lifecycle management, runtime caching, inference history, metrics, authentication, and a web dashboard.

## ✨ Highlights

- **Model registry** with versioned model management
- **Artifact management** with upload, replacement, validation, size limits, and filename normalization
- **Multiple runtimes** for Python, JSON, and scikit-learn artifacts
- **Explicit deployment lifecycle** with deploy, undeploy, and retirement behavior
- **Inference API** with version-aware prediction requests
- **Runtime caching** with safe artifact replacement invalidation
- **Restricted Python execution** with import, dunder, and unsafe builtin checks
- **Authentication** with configurable API key protection
- **Metrics and inference history** for operational visibility
- **Dockerized development** with PostgreSQL and Redis
- **Next.js dashboard** for models, inference, history, and monitoring
- **Automated CI** for backend tests, compilation, and frontend builds

## 🏗️ Architecture

![ModelDock architecture](docs/diagrams/architecture.png)

## 🔄 Model Lifecycle

![ModelDock model lifecycle](docs/diagrams/model-lifecycle.png)

Key rules:

1. Uploading or replacing an artifact returns the version to a validated state.
2. A version must be deployed before it can receive inference traffic.
3. Deploying a new version retires the previously deployed version for that model.
4. Replacing an artifact invalidates its cached runtime after the database change commits.
5. Undeployed versions reject prediction requests.

## 🧩 Runtime System

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

## ⚡ Runtime Caching

Loaded runtime instances are cached to avoid repeatedly loading the same artifact.

When an artifact changes:

![ModelDock runtime cache invalidation flow](docs/diagrams/runtime-cache.png)

Cache invalidation is tied to the persistence flow so a failed artifact replacement does not leave cache state inconsistent.

## 🔐 Security and Artifact Handling

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

For non-local environments, keep authentication enabled and store secrets outside source control.

## 📊 Inference and Observability

Inference requests record operational data including:

- Model and version identity
- Prediction success or failure
- Inference latency
- Inference history

The dashboard exposes model-specific inference, history, and monitoring views.

## 🌐 API

The backend provides endpoints for:

- Model and version registration
- Artifact upload and replacement
- Deployment and undeployment
- Prediction
- Health checks
- Metrics
- Inference history
- API key management

Prediction requests use:

```text
/api/v1/models/{modelId}/versions/{version}/predict
```

The FastAPI application also provides interactive OpenAPI documentation.

Frontend routes include:

```text
/models/{modelId}
/inference/{modelId}/{version}
/history/{modelId}/{version}
/monitoring/{modelId}/{version}
```

## 🐳 Run Locally

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

## 🧪 Verification

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

Current verified baseline:

| Check | Result |
| --- | --- |
| Backend tests | 72 passed |
| Backend compile | Passed |
| Frontend typecheck | Passed |
| Frontend production build | Passed |

## 🤖 CI

GitHub Actions validates the project with:

![ModelDock CI pipeline](docs/diagrams/ci-pipeline.png)

Workflow:

```text
.github/workflows/ci.yml
```

## 📁 Project Structure

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

## 🛠️ Tech Stack

| Layer | Technologies |
| --- | --- |
| Backend | Python, FastAPI, SQLAlchemy, Alembic, Pydantic, Pytest |
| Frontend | Next.js, React, TypeScript |
| Infrastructure | Docker, Docker Compose, PostgreSQL, Redis |
| ML runtimes | Python, JSON, scikit-learn, Joblib |
| CI | GitHub Actions |

## 🧠 Engineering Focus

ModelDock is built around a few practical infrastructure principles:

- **Explicit state:** registration, validation, deployment, and retirement are separate concerns.
- **Runtime abstraction:** model loading is isolated from API logic.
- **Cache correctness:** artifact changes invalidate affected runtime state safely.
- **Persistent telemetry:** inference behavior is stored instead of kept only in memory.
- **Defensive artifact handling:** uploaded model files are validated before execution.
- **Automated verification:** backend and frontend checks run locally and in CI.

## 🤝 Contributing

ModelDock is open to contributions from developers, students, and ML practitioners.

New to the project? Start with the [New contributors start here](https://github.com/aawhan0/ModelDock/issues/12) guide, then pick an open [good first issue](https://github.com/aawhan0/ModelDock/issues?q=is%3Aissue%20state%3Aopen%20label%3A%22good%20first%20issue%22).

Before opening a pull request, please read [CONTRIBUTING.md](CONTRIBUTING.md). The repository runs automated backend and frontend checks on pull requests.

## 👤 Author

### Aawhan Vyas

AI engineering, backend systems, full-stack development, and practical ML infrastructure.

- **LinkedIn:** [Aawhan Vyas](https://www.linkedin.com/in/aawhanvyas/)
- **GitHub:** [aawhan0](https://github.com/aawhan0)
