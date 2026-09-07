# ModelDock**

> **Local-first ML model serving platform for registering, versioning,

> deploying, and serving model artifacts through authenticated APIs.**

ModelDock is a full-stack AI/ML infrastructure project built to

demonstrate the engineering required to move a model artifact from

registration to controlled inference.

It combines a ****FastAPI backend****, ****Next.js dashboard****, **PostgreSQL

metadata storage**, ****Redis-backed infrastructure****, ****Docker Compose****,

pluggable model runtimes, runtime caching, artifact validation,

deployment lifecycle controls, metrics, inference history, and automated

testing.
---
## ✨ Why ModelDock?

ModelDock treats model serving as an engineering lifecycle: **register → validate → deploy → infer → observe**. It keeps model versions, artifacts, runtime state, deployment state, and inference telemetry explicit.

---
## 🚀 Core Features**

  -----------------------------------------------------------------------

  Area                                Capability

  ----------------------------------- -----------------------------------

  Model Registry                      Register models and manage versions

  Artifact Management                 Upload, replace, validate, and

                                      store model artifacts

  Runtime System                      Pluggable Python, JSON, and

                                      scikit-learn runtimes

  Deployment                          Explicit deploy, undeploy, and

                                      retirement lifecycle

  Inference                           Version-aware prediction API

  Runtime Cache                       Cached runtime instances with

                                      artifact replacement invalidation

  Security                            API key authentication and

                                      restricted Python artifact policy

  Health                              Model version artifact and runtime

                                      health checks

  Observability                       Persistent latency, success, error,

                                      and inference history data

  Storage                             PostgreSQL metadata plus local

                                      artifact storage

  Infrastructure                      Docker Compose with Redis-backed

                                      application infrastructure

  Frontend                            Next.js dashboard and

                                      model-specific views

  CI                                  Automated backend compilation,

                                      tests, and frontend build checks

  -----------------------------------------------------------------------
---
## 🏗️ Architecture**

``` text

                         ┌─────────────────────────┐

                         │       Next.js UI        │

                         │        Frontend         │

                         └────────────┬────────────┘

                                      │

                                      │ HTTP

                                      ▼

                         ┌─────────────────────────┐

                         │        FastAPI          │

                         │         Backend         │

                         └────────────┬────────────┘

                                      │

                 ┌────────────────────┼────────────────────┐

                 │                    │                    │

                 ▼                    ▼                    ▼

        ┌────────────────┐   ┌────────────────┐   ┌────────────────┐

        │   PostgreSQL   │   │     Redis      │   │ Runtime System │

        │                │   │                │   │                │

        │ Models         │   │ Application    │   │ Python         │

        │ Versions       │   │ infrastructure │   │ JSON           │

        │ Metrics        │   │                │   │ scikit-learn   │

        │ History        │   │                │   │                │

        └────────────────┘   └────────────────┘   └───────┬────────┘

                                                          │

                                                          ▼

                                                 ┌────────────────┐

                                                 │ Local Artifact │

                                                 │ Storage +      │

                                                 │ Runtime Cache  │

                                                 └────────────────┘

```
---
## 🔄 Model Lifecycle**

Each model version follows an explicit lifecycle:

``` text

        ┌───────────┐

        │  Created  │

        └─────┬─────┘

              │

              ▼

        ┌───────────┐

        │ Validated │

        └─────┬─────┘

              │

              │ deploy

              ▼

        ┌───────────┐

        │ Deployed  │

        └─────┬─────┘

              │

              │ replace / undeploy / retire

              ▼

        ┌───────────┐

        │  Retired  │

        └───────────┘

```

Important lifecycle rules:

1.  Uploading or replacing an artifact returns the version to a

    validated state.

2.  A version must be explicitly deployed before inference is allowed.

3.  Deploying a new version retires the previously deployed version for

    that model.

4.  Replacing an artifact invalidates the corresponding runtime cache

    entry.

5.  Undeployed versions cannot receive prediction requests.

This keeps artifact state and serving state explicit instead of relying

on implicit behavior.
---
## 🧩 Runtime System**

ModelDock uses a runtime registry and a common runtime contract.

Current runtimes:
### Python**

Executes a Python artifact containing a callable named `model`.

The Python runtime applies an intentionally restricted policy before

execution, including:

-   Import blocking

-   Dunder name and attribute blocking

-   Explicit unsafe builtin blocking

-   Restricted builtin namespace

-   Artifact validation before execution

The runtime is designed as a portfolio-grade restricted execution layer.

It should not be described as a complete security sandbox for hostile

arbitrary Python.
### JSON**

Supports deterministic JSON-based prediction mappings.

Example:

``` json

{

  "predictions": {

    "hello": "positive",

    "goodbye": "negative"

  }

}

```
### scikit-learn**

Loads serialized scikit-learn-compatible models and validates that the

resulting model exposes the expected prediction interface.
### Why the runtime abstraction matters**

The API layer does not need to know how each model format is loaded.

Conceptually:

``` text

Artifact

   │

   ▼

Runtime Registry

   │

   ├── Python Runtime

   ├── JSON Runtime

   └── Sklearn Runtime

           │

           ▼

        Model

           │

           ▼

       Prediction

```

Adding another runtime can therefore remain isolated from the core API

flow.
---
## ⚡ Runtime Caching**

ModelDock caches loaded runtime instances to avoid repeatedly loading

the same artifact.

Cache correctness is treated as part of the deployment system.

When an artifact is replaced:

``` text

Old Artifact

     │

     ▼

Cache Entry

     │

     X

Invalidated

     │

     ▼

New Artifact

     │

     ▼

Fresh Runtime Load

```

The replacement flow also protects cache invalidation from occurring

before the database transaction is successfully committed.

This prevents the cache from being invalidated for a replacement that

ultimately fails to persist.
---
## 🔐 Authentication**

Protected API endpoints use API key authentication.

Requests use:

``` text

Authorization: Bearer <MODELDOCK_API_KEY>

```

Authentication can be enabled or disabled through environment

configuration for local development.

For non-local environments, use a strong administrator API key and keep

secrets outside source control.
---
## 🛡️ Artifact Validation**

Artifact handling is intentionally defensive.

ModelDock includes controls for:

-   Artifact path resolution

-   File existence validation

-   Configurable maximum artifact size

-   Filename normalization

-   Runtime-specific validation

-   Restricted Python source checks

-   Explicit deployment state

-   Runtime cache invalidation

The goal is to make artifact handling a controlled application workflow

rather than treating uploaded files as trusted input.
---
## 📊 Metrics and Inference History**

Inference requests are recorded so the system can expose operational

information such as:

-   Prediction success

-   Prediction errors

-   Inference latency

-   Model and version identity

-   Inference history

This provides a foundation for monitoring model-serving behavior instead

of treating inference as a black box.
---
## 🌐 API Surface**

The backend provides APIs for:

-   Model registration

-   Model version management

-   Artifact upload

-   Artifact replacement

-   Deployment

-   Undeployment

-   Prediction

-   Health checks

-   Metrics

-   Inference history

-   API key management

The FastAPI application also exposes interactive OpenAPI documentation.

Model-specific frontend routes include:

``` text

/models/{modelId}

/inference/{modelId}/{version}

/history/{modelId}/{version}

/monitoring/{modelId}/{version}

```

Prediction requests use:

``` text

/api/v1/models/{modelId}/versions/{version}/predict

```
---
## 🐳 Running Locally**
### Requirements**

-   Docker

-   Docker Compose

-   Git
### 1. Clone**

``` powershell

git clone https://github.com/aawhan0/ModelDock.git

cd ModelDock

```
### 2. Configure environment**

Copy the example environment file:

``` powershell

Copy-Item .env.example .env

```

Set the frontend origin to the exact browser origin allowed by the API.

For local development, configure authentication as appropriate. Outside

local-only development, keep authentication enabled and use a strong

administrator API key.
### 3. Start the stack**

``` powershell

docker compose up -d

```
### 4. Apply migrations**

``` powershell

docker compose exec backend alembic upgrade head

```
### 5. Check services**

``` powershell

docker compose ps

```
### 6. Open the application**

Use the frontend and backend ports defined by the Docker Compose

configuration.
---
## 🧪 Verification**

The project includes backend unit and integration tests plus frontend

type and production-build checks.
### Backend tests**

``` powershell

docker compose exec backend pytest -q

```
### Backend compilation**

``` powershell

docker compose exec backend python -m compileall -q app

```
### Frontend typecheck**

``` powershell

docker compose exec frontend npm run typecheck

```
### Frontend production build**

``` powershell

docker compose exec frontend npm run build

```

A clean local verification should complete without test, compilation,

TypeScript, or production-build errors.
---
## 🤖 Continuous Integration**

GitHub Actions verifies the project automatically.

The CI workflow includes:

``` text

Backend

  ├── Compile check

  └── Test suite

Frontend

  └── Production build

```

Workflow location:

``` text

.github/workflows/ci.yml

```
---
## 📁 Project Structure**

``` text

ModelDock/

├── .github/

│   └── workflows/

│       └── ci.yml

│

├── backend/

│   ├── alembic/

│   │   └── versions/

│   │

│   ├── app/

│   │   ├── api/

│   │   ├── core/

│   │   ├── models/

│   │   ├── schemas/

│   │   └── services/

│   │       └── runtimes/

│   │

│   └── tests/

│

├── frontend/

│

├── docker-compose.yml

├── .env.example

└── README.md

```
---
## 🧠 Engineering Decisions

- **Explicit deployment:** uploaded versions do not receive inference traffic until deployed.
- **Runtime abstraction:** model loading is isolated behind runtime-specific implementations.
- **Cache correctness:** artifact replacement invalidates the affected runtime only after the database change commits.
- **Persistent telemetry:** inference metrics and history are stored for later inspection.
- **Containerized workflow:** Docker Compose provides a repeatable local environment.
- **Automated verification:** backend tests, compilation, frontend typechecking, builds, and CI guard against regressions.

---
## 📌 Status

**Portfolio-ready.** Current local verification:

| Check | Result |
| --- | --- |
| Backend tests | 72 passed |
| Backend compile | Passed |
| Frontend typecheck | Passed |
| Frontend production build | Passed |

ModelDock is focused on practical ML serving infrastructure, not hyperscale production inference.

---
## 🛠️ Tech Stack

**Backend:** Python, FastAPI, SQLAlchemy, Alembic, Pydantic, Pytest  
**Frontend:** Next.js, React, TypeScript  
**Infrastructure:** Docker, Docker Compose, PostgreSQL, Redis  
**ML:** Python runtime, JSON runtime, scikit-learn, Joblib  
**CI:** GitHub Actions

---
## 👤 Author**
### Aawhan Vyas**

Building projects around **AI engineering, backend systems, full-stack

development, and practical ML infrastructure**.

****LinkedIn:****\\

https://www.linkedin.com/in/aawhanvyas/

****GitHub:****\\

https://github.com/aawhan0
---
## ⭐ If You Found This Useful**

If ModelDock helped you understand model serving, ML infrastructure, or

production-oriented backend engineering, consider giving the repository

a star.
---
::: {align="center"}

****ModelDock****

**From model artifact to controlled inference.*

:::
