# ModelDock

ModelDock is a local-first, Dockerized ML model serving platform for registering, versioning, deploying, and serving machine-learning models through authenticated APIs.

It is designed to demonstrate the engineering involved in turning a model artifact into a reliable, measurable inference service.

## Features

- Model registry with versioned model artifacts
- Pluggable runtime backends for Python, JSON, and scikit-learn models
- Explicit model deployment lifecycle
- Artifact validation and safe local storage
- Runtime caching with cache invalidation on artifact replacement
- Authenticated inference APIs using API keys
- Model version health checks
- Persistent inference latency, success, and error metrics
- Inference history
- PostgreSQL-backed metadata storage
- Redis-backed application infrastructure
- Next.js dashboard
- Docker Compose development environment
- Automated backend tests and frontend build checks with GitHub Actions

## Architecture

```text
                    ┌──────────────────────┐
                    │     Next.js UI       │
                    │      Frontend        │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │      FastAPI         │
                    │       Backend        │
                    └──────┬───────┬───────┘
                           │       │
              ┌────────────┘       └─────────────┐
              ▼                                  ▼
     ┌─────────────────┐                ┌─────────────────┐
     │   PostgreSQL    │                │      Redis      │
     │ Models / Metrics│                │ Application     │
     └─────────────────┘                │ infrastructure  │
                                        └─────────────────┘
              │
              ▼
     ┌─────────────────┐
     │ Runtime Registry│
     │ Python / JSON / │
     │    sklearn      │
     └────────┬────────┘
              │
              ▼
     ┌─────────────────┐
     │ Local Artifacts │
     │  + Runtime Cache│
     └─────────────────┘
```

## Model Lifecycle

A model version follows an explicit deployment lifecycle:

```text
uploaded
   │
   ▼
validated
   │
   ▼
deployed
   │
   ▼
retired
```

Uploading or replacing an artifact moves the version to `validated`.

A version must be explicitly deployed before inference is allowed.

Deploying a new version automatically retires the previously deployed version for that model.

This prevents inference from accidentally running against an uploaded but undeployed artifact.

## Runtime System

ModelDock uses a runtime registry so different artifact formats can be handled through a common interface.

Current runtimes:

- `python` - Python model functions
- `json` - JSON-based prediction mappings
- `sklearn` - serialized scikit-learn models

This keeps model-specific loading logic isolated from the API layer and makes additional runtimes easier to add.

## API

The backend exposes APIs for:

- Model registration
- Model version management
- Artifact upload and replacement
- Model deployment and undeployment
- Model inference
- Model health checks
- Inference metrics and history
- API key management

The FastAPI application also provides interactive API documentation through its standard OpenAPI interface.

## Authentication

Protected endpoints use API-key authentication.

Requests use:

```text
Authorization: Bearer <MODELDOCK_API_KEY>
```

Authentication can be enabled or disabled through environment configuration for local development.

## Running Locally

### Requirements

- Docker
- Docker Compose

### Start the application

```powershell
docker compose up -d
```

Apply database migrations:

```powershell
docker compose exec backend alembic upgrade head
```

Check running services:

```powershell
docker compose ps
```

The frontend and backend are exposed through the Docker Compose configuration.

### Run backend tests

```powershell
docker compose exec backend pytest -q
```

Compile-check the backend:

```powershell
docker compose exec backend python -m compileall -q app
```

## CI

GitHub Actions automatically checks:

- Backend test suite
- Frontend production build

Workflow:

```text
.github/workflows/ci.yml
```

## Project Structure

```text
ModelDock/
├── .github/
│   └── workflows/
│       └── ci.yml
├── backend/
│   ├── alembic/
│   │   └── versions/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   │       └── runtimes/
│   └── tests/
├── frontend/
├── docker-compose.yml
├── .env.example
└── README.md
```

## Engineering Highlights

ModelDock focuses on practical production-oriented concerns rather than only model inference:

- Versioned artifacts and deployment state
- Safe artifact path resolution
- Runtime caching and invalidation
- API authentication
- Persistent operational metrics
- Database migrations with Alembic
- Integration and lifecycle testing
- Containerized local development
- Continuous integration

## Status

ModelDock is an actively developed portfolio project focused on demonstrating full-stack AI/ML infrastructure and model-serving engineering.

> Built as part of a Full-Stack AI Engineer portfolio.