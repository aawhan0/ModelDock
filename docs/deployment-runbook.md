# Production deployment and rollback runbook

This runbook is the operator path for deploying ModelDock in a production-like environment and handling the two situations operators hit most often: rolling out a new version, and rolling back when something is wrong.

It is a procedure, not a reference. For the behavior behind each step, see [Production operations](operations.md), [Production reliability](production-reliability.md), [Production monitoring](production-monitoring.md), and the [release readiness checklist](release-readiness.md).

Related documents:

- [`operations.md`](operations.md) — health/readiness contracts, logging, container behavior
- [`production-reliability.md`](production-reliability.md) — request limits, timeouts, idempotency
- [`production-monitoring.md`](production-monitoring.md) — monitoring, drift, thresholds
- [`release-readiness.md`](release-readiness.md) — pre-release checklist and release evidence
- [`api-compatibility.md`](api-compatibility.md) — API contract and operational headers
- [`../README.md`](../README.md) — local quickstart and first prediction

## Before you start

Prerequisites:

- Docker Engine and Docker Compose v2
- `curl` for the verification commands
- A reachable PostgreSQL and Redis for the target environment
- A git checkout of the commit you intend to deploy

Set these for the session. Every command below uses them.

```bash
export MODELDOCK_BACKEND=http://localhost:8000
export MODELDOCK_FRONTEND=http://localhost:3000
export MODELDOCK_ADMIN_API_KEY=your-admin-api-key
```

## 1. Required configuration

Copy the template and set real values before starting anything:

```bash
cp .env.example .env
```

`Settings` reads `.env` relative to the process working directory, and `backend/.dockerignore` excludes `.env` and `.env.*` from the image. Do not assume a mounted `.env` is visible to the application; inject configuration through the environment or the orchestrator instead.

### Values that must be set for a production-like deployment

| Variable | Why it matters |
| --- | --- |
| `MODELDOCK_ADMIN_API_KEY` | Single shared admin secret. Unset, and `/api/v1/auth/*` returns `503`. Required for key management. |
| `MODELDOCK_DATABASE_URL` | Full SQLAlchemy URL, for example `postgresql+psycopg://user:pass@host:5432/modeldock`. |
| `MODELDOCK_API_AUTH_ENABLED` | Defaults to `true`. Keep it enabled. Any value outside `1`/`true`/`yes` opens the entire `/api/v1` surface. |
| `MODELDOCK_FRONTEND_ORIGIN` | Primary browser origin for CORS. |
| `MODELDOCK_CORS_ORIGINS` | Optional comma-separated additional origins. Wildcards are rejected at startup. |
| `MODELDOCK_RATE_LIMIT_REDIS_URL` | Redis instance backing rate limits. |
| `MODELDOCK_LOG_LEVEL` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`. Default `INFO`. |

`NEXT_PUBLIC_API_URL` is a build argument, not a runtime variable. The Next.js image bakes it in at build time, so changing the backend URL requires a rebuild, not a restart.

Confirm nothing is left at a template value:

```bash
grep -E 'replace-with-a-long-random-admin-key|^MODELDOCK_API_AUTH_ENABLED=false' .env && echo "template values still present"
```

## 2. Database migrations and startup checks

**ModelDock does not run migrations at application startup.** The backend lifespan only manages the Redis client. `alembic upgrade head` is a mandatory, separate step that must complete before traffic is switched over.

This matters during incidents: `/ready` executes `SELECT 1`, so it returns `200 OK` on a database that has no application schema. A green readiness probe does not mean migrations ran.

Run migrations from the `backend` directory, because `alembic/env.py` imports the application package and `alembic.ini` sets `prepend_sys_path = .`:

```bash
docker compose exec -T backend alembic upgrade head
```

`alembic.ini` holds a `sqlalchemy.url`, but `alembic/env.py` overwrites it with `settings.database_url`, so `MODELDOCK_DATABASE_URL` is the value that actually takes effect.

Verify the applied revision and that no model changes are unmigrated:

```bash
docker compose exec -T backend alembic current
docker compose exec -T backend alembic check
```

At the time of writing, head is `0015_inference_idempotency`. Migrations form a single linear chain with no branch labels, so there is exactly one head to reach.

Test reversibility on a disposable database, not production:

```bash
docker compose exec -T backend alembic downgrade -1 && docker compose exec -T backend alembic upgrade head
```

### Startup checks

```bash
curl -s "$MODELDOCK_BACKEND/health"
curl -s "$MODELDOCK_BACKEND/ready"
docker compose ps
```

Expect `{"status":"ok"}` from `/health`, and `{"status":"ready","checks":{"database":"ok","redis":"ok"}}` from `/ready`.

## 3. Production Docker workflow

The repository ships two sets of Dockerfiles:

| File | Used by | Runs as | Includes Alembic |
| --- | --- | --- | --- |
| `backend/Dockerfile` | `docker-compose.yml` | root | No |
| `backend/Dockerfile.production` | Release workflow | non-root `modeldock` (uid 10001) | Yes |
| `frontend/Dockerfile` | `docker-compose.yml` | root | n/a |
| `frontend/Dockerfile.production` | Release workflow | non-root `node` | n/a |

`docker-compose.yml` is a **development** stack. It bind-mounts `./backend:/app` and `./frontend:/app` for hot reload, and it builds the development Dockerfiles. Do not treat it as a production deployment.

Two consequences worth knowing:

- `docker compose exec backend alembic upgrade head` only works because the bind mount overlays `alembic.ini` and `alembic/` into the container. The development image does not contain them.
- The development image runs as root and has no `HEALTHCHECK`.

Build the production images:

```bash
docker build --file backend/Dockerfile.production --tag modeldock-backend:local backend
docker build --file frontend/Dockerfile.production --build-arg NEXT_PUBLIC_API_URL="$MODELDOCK_BACKEND" --tag modeldock-frontend:local frontend
```

The frontend production build **fails without** `NEXT_PUBLIC_API_URL`, because the value is read during `next build`. Treat a missing value as a build error, not a warning.

Run the backend with configuration supplied explicitly:

```bash
docker run -d --name modeldock-backend -p 8000:8000 \
  -e MODELDOCK_DATABASE_URL="$MODELDOCK_DATABASE_URL" \
  -e MODELDOCK_ADMIN_API_KEY="$MODELDOCK_ADMIN_API_KEY" \
  -e MODELDOCK_API_AUTH_ENABLED=true \
  -e MODELDOCK_RATE_LIMIT_REDIS_URL="$MODELDOCK_RATE_LIMIT_REDIS_URL" \
  modeldock-backend:local
```

Migrations run inside the production image, because `Dockerfile.production` copies `alembic.ini` and `alembic/`:

```bash
docker exec modeldock-backend alembic upgrade head
```

### Artifact storage is not durable by default

`Dockerfile.production` creates and chowns `/app/artifacts` but declares no `VOLUME`, and there is no environment variable to relocate the store: `LocalArtifactStore` is constructed with a fixed relative root of `artifacts`, which resolves to `/app/artifacts` inside the container.

Container replacement therefore destroys uploaded model artifacts. **Mount a persistent volume at `/app/artifacts`** in any environment where models must survive a restart:

```bash
docker run -d --name modeldock-backend -p 8000:8000 \
  -v modeldock-artifacts:/app/artifacts \
  -e MODELDOCK_DATABASE_URL="$MODELDOCK_DATABASE_URL" \
  -e MODELDOCK_ADMIN_API_KEY="$MODELDOCK_ADMIN_API_KEY" \
  modeldock-backend:local
```

Persist one volume across every replica. The store is a plain directory tree, so a shared filesystem works; it is not a shared cache, and replicas do not coordinate runtime cache invalidation with each other.

## 4. Health and readiness verification

ModelDock exposes liveness and readiness separately. Wire them separately in any orchestrator.

| Endpoint | Checks | Failure behavior |
| --- | --- | --- |
| `GET /health` | Process is accepting HTTP. No dependencies touched. | Always `200` while the process runs. |
| `GET /ready` | PostgreSQL (`SELECT 1`) and Redis (`PING`). | `503` with `"status":"not_ready"` naming the failed dependency. |

```bash
curl -s "$MODELDOCK_BACKEND/health"
curl -s "$MODELDOCK_BACKEND/ready"
```

A database outage should fail readiness without restarting the application. Use `/health` for liveness and `/ready` for traffic gating.

### Container health semantics

Verify the health status directly:

```bash
docker inspect --format='{{.State.Health.Status}}' modeldock-backend
```

`backend/Dockerfile.production` sets its Docker `HEALTHCHECK` against `/health`, **not** `/ready`. This is a deliberate and important consequence: a backend whose database is unreachable stays Docker-`healthy` while `/ready` returns `503`.

So a green container status is not evidence of a working deployment. Confirm `/ready` explicitly in any automated gate.

The Compose stack differs: its backend health check uses `/ready`, so the development stack will not report healthy until dependencies respond.

## 5. Model registration, artifact upload, deployment, and prediction

All `/api/v1` routes require `Authorization: Bearer <key>`. The header name is `Authorization` with the `Bearer` scheme; a bare `X-API-Key` header is not accepted.

`MODELDOCK_ADMIN_API_KEY` is a superuser that bypasses every scope check. Prefer a scoped key for routine operations and reserve the admin key for bootstrapping.

Create a scoped key, and keep the raw value, because it is not retrievable later:

```bash
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/auth/keys" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "release-operator", "scopes": ["models:manage", "artifacts:manage", "inference:execute", "metrics:read"]}'
```

Scopes are `models:manage`, `artifacts:manage`, `inference:execute`, `metrics:read`, and `experiments:manage`. A missing scope returns `403`.

> Shell note: in PowerShell, inline JSON in `curl -d` gets mangled. Use `--data-binary "@file.json"` or an equivalent form when scripting on Windows.

### Register a model and a version

```bash
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "greeting-model", "task": "text-classification"}'

curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": "v1", "framework": "json"}'
```

A new version starts in status `uploaded`. Supported `framework` values are `python`, `json`, and `sklearn`.

### Upload the artifact

```bash
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/artifact" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY" \
  -F "file=@model.json"
```

Upload forces the version to `validated` and records the artifact's SHA-256 and size. Uploading to a version that is currently `deployed` returns `409`, because replacing a live artifact in place is not allowed.

Expected limits and failures:

- `413` when the file exceeds `MODELDOCK_MAX_ARTIFACT_SIZE_BYTES` (default 50 MiB)
- `422` when the file is empty, unloadable, or the framework is unknown

### Check readiness, then deploy

`deployment-readiness` evaluates the deployment policy without mutating state, which makes it safe to call from a promotion step:

```bash
curl -s "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/deployment-readiness" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

Check artifact integrity directly:

```bash
curl -s "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/health" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

`"status":"healthy"` requires the artifact to be present, its SHA-256 to match, and the runtime to load it.

Deploy:

```bash
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/deploy" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

Deployment requires status `validated` and an artifact. It verifies the SHA-256, loads the runtime, and retires any previously deployed version of that model. If a deployment policy is enabled, a failed gate returns `409` with the specific reasons.

### Verify inference

```bash
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/predict" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -H "X-Request-ID: deploy-check-1" \
  -d '{"input": "hello"}'
```

A version that is not `deployed` returns `409` and never executes the model.

For retry-safe clients, add `Idempotency-Key`. Repeating a key with the same request replays the stored response without re-running the model; reusing a key with a different request returns `409`. See [Production reliability](production-reliability.md).

## 6. Monitoring and deployment-readiness checks

Monitoring is based on persisted inference records, so it survives restarts. All endpoints require `metrics:read`.

```bash
curl -s "$MODELDOCK_BACKEND/api/v1/metrics/$MODEL_ID/v1/monitoring?hours=24" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

curl -s "$MODELDOCK_BACKEND/api/v1/metrics/$MODEL_ID/v1/predictions?hours=24&limit=50" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

curl -s "$MODELDOCK_BACKEND/api/v1/metrics/$MODEL_ID/v1/drift?reference_size=50&window_size=50" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

curl -s "$MODELDOCK_BACKEND/api/v1/metrics/$MODEL_ID/compare?baseline=v1&candidate=v2&hours=24" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

Scrape Prometheus metrics from `/metrics`, which is unauthenticated like `/health`:

```bash
curl -s "$MODELDOCK_BACKEND/metrics"
```

Correlate a specific prediction using the `X-Request-ID` you sent:

```bash
curl -s "$MODELDOCK_BACKEND/api/v1/metrics/requests/$REQUEST_ID" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

Confirm the API surface and the authentication boundary after any deployment:

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$MODELDOCK_BACKEND/api/v1/models"   # expect 401
curl -s -o /dev/null -w '%{http_code}\n' "$MODELDOCK_BACKEND/api/v1/models" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"                        # expect 200
```

Expect `401` unauthenticated and `200` with a valid key. A `200` on the unauthenticated call means authentication is disabled and the whole API is exposed.

## 7. Rollback

ModelDock has two independent rollback surfaces. Use the right one.

| Goal | Mechanism |
| --- | --- |
| Undo a bad model version | `POST /api/v1/models/{id}/versions/{version}/rollback` |
| Undo a bad application release | Redeploy the previous image revision |

### Roll back a model version

Find the target version and confirm its status:

```bash
curl -s "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

curl -s "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/deployment-history?limit=20" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

A rollback target must exist and be in status `validated` or `retired`. A `deployed` version returns immediately as a no-op; any other status returns `409`.

```bash
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/rollback" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

Rollback verifies the artifact's SHA-256, loads the runtime, retires the current `deployed` version, and records an audit event. Only after this succeeds will prediction traffic flow to the restored version.

Two behaviors to be aware of:

- The rollback endpoint deliberately does **not** evaluate the deployment quality gate. Only `deploy` applies policy. This is what makes rollback usable during an incident, but it means a rollback can restore a version that would not pass promotion today.
- An artifact is not deleted by being retired. The target's artifact must still be on disk and pass its integrity check; a missing artifact returns `409`.

Verify after rollback:

```bash
curl -s "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/health" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/predict" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "hello"}'
```

### Other lifecycle transitions

```bash
# Stop serving a version; status deployed -> retired
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/undeploy" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

# Bring a retired version back to validated
curl -s -X POST "$MODELDOCK_BACKEND/api/v1/models/$MODEL_ID/versions/v1/revalidate" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

`undeploy` leaves a model with no deployed version, after which predictions return `409`. `revalidate` only accepts a `retired` version and does not write a deployment audit event, so a post-incident review of `deployment-history` will not show it.

### Roll back an application release

Release images are published to GHCR with two tags: a semantic version and a commit SHA. **Use the SHA tag as the rollback anchor**, because it identifies the exact commit rather than a mutable version label.

```text
ghcr.io/aawhan0/modeldock/backend:<version>
ghcr.io/aawhan0/modeldock/backend:<commit-sha>
ghcr.io/aawhan0/modeldock/frontend:<version>
ghcr.io/aawhan0/modeldock/frontend:<commit-sha>
```

Record the current revision before changing anything, so rollback does not depend on memory:

```bash
docker inspect --format='{{index .Config.Labels "org.opencontainers.image.revision"}}' modeldock-backend
```

To roll back an application release:

1. Redeploy the backend and frontend images pinned to the previous commit SHA.
2. Re-run migrations for the target commit. Decide the direction deliberately: `alembic downgrade` is rarely safe in production, and this is a manual, reviewed step.
3. Re-run the verification commands in section 10.
4. If the bad release deployed a model version, roll that version back separately using the section above. Redeploying images does not change which model version is `deployed`, because that state lives in the database.

Confirm the mismatch is expected: the database is the source of truth for model deployment state, so an image rollback leaves `deployed` versions untouched. Roll back the model version explicitly.

## 8. Common failure modes

Work down this list before escalating.

### Backend will not start

```bash
docker compose logs --no-color backend
```

- **Invalid `MODELDOCK_CORS_ORIGINS`** — an empty list or a `*` wildcard is rejected at startup.
- **Drift thresholds inverted** — `MODELDOCK_MONITORING_DRIFT_SIGNIFICANT_THRESHOLD` must be greater than or equal to `MODELDOCK_MONITORING_DRIFT_MODERATE_THRESHOLD`.
- **Invalid `MODELDOCK_LOG_LEVEL`** — must match `DEBUG`, `INFO`, `WARNING`, `ERROR`, or `CRITICAL`.

These are startup validation failures, so the process exits rather than serving in a degraded state.

### `/ready` returns 503

```bash
curl -s "$MODELDOCK_BACKEND/ready"
```

The response names the failed dependency in `checks`.

- `database: unavailable` — check connectivity and `MODELDOCK_DATABASE_URL`.
- `redis: unavailable` — check `MODELDOCK_RATE_LIMIT_REDIS_URL`. Note the rate limiter fails open by default, so a Redis outage returns `503` here while still serving `/api/v1` traffic.
- **Migrations missing** — if `database: ok` but `/api/v1` calls fail on a missing relation, run `alembic upgrade head`. `/ready` only runs `SELECT 1` and cannot detect an absent schema.

### 401 or 403 on an API call

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$MODELDOCK_BACKEND/api/v1/models" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"
```

- `401` — missing or wrong key, or the key was revoked. Confirm the header uses the `Bearer` scheme.
- `403` — the key is valid but lacks the required scope. The message names the scope.
- `503` on `/api/v1/auth/*` — `MODELDOCK_ADMIN_API_KEY` is unset.

### 409 on deploy or rollback

Read the message; it names the cause.

- `Model version is not deployable` — the artifact is missing, or its SHA-256 no longer matches. Confirm the `/app/artifacts` volume is actually mounted and persistent.
- `Only validated model versions can be deployed` — status is `uploaded` or `retired`. Use `revalidate` on a retired version.
- `Deployment policy rejected model version` — a quality gate failed. Read `deployment-readiness` for the specific reasons.

### Artifact cannot be found after container replacement

Expected when `/app/artifacts` is not on a persistent volume. The production image declares no `VOLUME` and the store root is not configurable. See section 3.

### 429 rate limited

The default is 60 requests per client IP per 60-second window, applied across all `/api/v1` routes. Behind a proxy, the client key is the proxy's address unless uvicorn is started with proxy-header handling, so all traffic can share one bucket. Response headers `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` describe the current window.

### 409 on an artifact upload

A `deployed` version cannot have its artifact replaced. Roll back or undeploy first, then upload.

### 413 on upload or inference

The artifact or request body exceeds its configured bound. See [Production reliability](production-reliability.md) for the ingress-level limit that should accompany it.

## 9. Security reminders

- **Keep `MODELDOCK_API_AUTH_ENABLED=true`.** It is the only control on the `/api/v1` surface.
- **Treat `MODELDOCK_ADMIN_API_KEY` as a superuser.** It bypasses all five scopes. Use scoped keys for routine work and rotate the admin key only with awareness of the blast radius.
- **Never put the admin key in a `NEXT_PUBLIC_*` variable.** Those values are compiled into browser JavaScript and are public. Use a dedicated browser-facing key.
- **API keys are shown once.** The raw value from `POST /api/v1/auth/keys` is not retrievable afterward. Store it in your secret manager.
- **Keep secrets out of source control.** `.env` is gitignored and excluded from images, and `gitleaks` scans the history. Inject through the environment or orchestrator secrets.
- **Protect model artifacts.** They are untrusted input and may be executable Python. Restrict volume permissions, and never serve the artifact directory over HTTP. Avoid putting credentials or private data in artifact filenames.
- **Treat logs as sensitive.** Backend logs are one JSON object per line and include `request_id`, `path`, and `status_code`. They do not contain API keys or raw model inputs. Do not paste request bodies containing user data into tickets.
- **Do not put secrets in `X-Request-ID`.** It is a correlation identifier and is logged. See [Production operations](operations.md).
- **Restrict the unauthenticated surface.** `/health`, `/ready`, `/metrics`, `/docs`, `/redoc`, and `/openapi.json` are all reachable without a key. Limit `/docs` and `/openapi.json` at the ingress in environments where the schema is sensitive.
- **Back up and encrypt the artifact volume and the database.** Both hold model binaries and inference telemetry.

## 10. Pre-deployment verification checklist

Run all of these before calling a deployment healthy.

```bash
# Services and container health
docker compose ps
docker inspect --format='{{.State.Health.Status}}' modeldock-backend

# Liveness and readiness
curl -s "$MODELDOCK_BACKEND/health"
curl -s "$MODELDOCK_BACKEND/ready"

# Schema is current
docker compose exec -T backend alembic current
docker compose exec -T backend alembic check

# API surface
curl -s -o /dev/null -w 'openapi=%{http_code}\n' "$MODELDOCK_BACKEND/openapi.json"
curl -s -o /dev/null -w 'docs=%{http_code}\n' "$MODELDOCK_BACKEND/docs"

# Authentication boundary
curl -s -o /dev/null -w 'unauth=%{http_code}\n' "$MODELDOCK_BACKEND/api/v1/models"
curl -s -o /dev/null -w 'auth=%{http_code}\n' "$MODELDOCK_BACKEND/api/v1/models" \
  -H "Authorization: Bearer $MODELDOCK_ADMIN_API_KEY"

# Frontend
curl -s -o /dev/null -w 'frontend=%{http_code}\n' "$MODELDOCK_FRONTEND"
```

A deployment is healthy when all of the following hold:

- [ ] `docker compose ps` shows backend, frontend, postgres, and redis running
- [ ] `/health` returns `{"status":"ok"}`
- [ ] `/ready` returns `200` with `database` and `redis` both `ok`
- [ ] Container health reports `healthy`
- [ ] `alembic current` is at head and `alembic check` reports no pending changes
- [ ] `/openapi.json` and `/docs` return `200`
- [ ] Unauthenticated `/api/v1/models` returns `401`, and authenticated returns `200`
- [ ] The deployed model version reports `"status":"healthy"`
- [ ] A test prediction succeeds and its `request_id` resolves via `/api/v1/metrics/requests/{request_id}`
- [ ] The artifact volume is persistent across container replacement
- [ ] The image revision is recorded for later rollback

## Related documentation

- [Production operations](operations.md)
- [Production reliability](production-reliability.md)
- [Production monitoring](production-monitoring.md)
- [Release readiness](release-readiness.md)
- [API compatibility policy](api-compatibility.md)
- [Batch inference](batch-inference.md)
- [Inference request tracking](inference-request-tracking.md)
