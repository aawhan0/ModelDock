# Contributing to ModelDock

Thanks for taking an interest in ModelDock.

ModelDock is a self-hostable ML platform for model registry, deployment, inference, monitoring, and experimentation. Contributions that improve correctness, security, documentation, developer experience, or maintainability are welcome.

## Before You Start

- Check existing issues and pull requests before starting substantial work.
- For larger changes, open an issue first so the approach can be discussed.
- Keep pull requests focused on one change.
- Do not include secrets, credentials, private data, or generated build artifacts.

## Local development quickstart

### Prerequisites

- Git
- Docker Engine with Docker Compose
- A terminal with `curl` for smoke tests
- Optional: Python 3.12 and Node.js 20 if you want to run backend/frontend commands directly outside the containers

### Clone and start the stack

```bash
git clone https://github.com/aawhan0/ModelDock.git
cd ModelDock
cp .env.example .env
# Update MODELDOCK_ADMIN_API_KEY in .env before using the app.
docker compose up -d --build
docker compose ps
# Wait until postgres and redis report healthy before running backend tests.
docker compose exec backend alembic upgrade head
```

The Docker Compose stack starts the backend API, the Next.js frontend, PostgreSQL, and Redis. The default local URLs are:

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5433
- Redis: localhost:6379

If something does not come up cleanly, see [Troubleshooting local development](#troubleshooting-local-development).

### Repository structure

```text
ModelDock/
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   └── tests/
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── screens/
├── docs/
├── docker-compose.yml
├── .env.example
├── README.md
├── CONTRIBUTING.md
└── scripts/
```

- `backend/`: FastAPI application, database migrations, and backend tests.
- `frontend/`: Next.js dashboard and TypeScript client code.
- `docs/`: design notes, API guidance, and operational documentation.
- `docker-compose.yml`: local development stack for the API, frontend, database, and Redis.
- `scripts/`: repo automation and helper scripts.

### Standard verification commands

Run the following from the repository root before opening a pull request:

```bash
docker compose exec backend pytest -q
docker compose exec backend python -m compileall -q app
docker compose exec frontend npm run typecheck
docker compose exec frontend npm run build
```

Use `git diff --check` for a quick sanity check on documentation and patch formatting.

### First contribution workflow

1. Create a branch for your work:

   ```bash
   git checkout -b my-change
   ```

2. Make a focused change in the relevant backend, frontend, docs, or infrastructure area.
3. Run the relevant checks from the section above.
4. Commit with a clear message and open a pull request.
5. Reference the issue or bug being fixed, and describe how the change was verified.

### Pull requests

Please include a short explanation of what changed, why it changed, and how it was verified. Update documentation when behavior or public APIs change.

Pull requests should pass the required CI checks before merging.

## Troubleshooting local development

These notes cover the problems that come up most often when bringing the Compose stack up for the first time. They assume you started from the repository root with a copy of `.env.example` as `.env`.

### Docker Compose services not starting

Confirm Docker Engine is running, then inspect service state and recent logs:

```bash
docker compose ps
docker compose logs --tail=80
```

Common causes:

- Port already in use: the stack binds `8000` (API), `3000` (frontend), `5433` (Postgres on the host), and `6379` (Redis). Stop the other process or change the host mapping in `docker-compose.yml`.
- Stale images or half-built containers after a pull: rebuild with `docker compose up -d --build`.
- Backend or frontend waiting on dependencies: Postgres and Redis must pass their healthchecks before the backend starts; the frontend waits on the backend `/ready` healthcheck.

### Backend health check failing

The backend healthcheck hits `http://127.0.0.1:8000/ready` inside the container. If `docker compose ps` shows the backend as `starting` or `unhealthy`:

```bash
docker compose logs backend --tail=80
curl -sS http://localhost:8000/health
curl -sS http://localhost:8000/ready
```

Typical fixes:

- Wait for Postgres and Redis to report `healthy`, then restart only the API: `docker compose restart backend`.
- Confirm `.env` has a valid `MODELDOCK_DATABASE_URL` that points at the Compose service name `postgres` (not `localhost`) when the API runs inside Docker.
- If you changed environment variables, recreate the container: `docker compose up -d --force-recreate backend`.

### Frontend environment variables

The dashboard talks to the API through `NEXT_PUBLIC_API_URL` (default `http://localhost:8000`) and, when auth is enabled, `NEXT_PUBLIC_MODELDOCK_API_KEY`.

- Copy `.env.example` to `.env` and set those values before `docker compose up`. `NEXT_PUBLIC_*` variables are baked in at frontend start, so change them and recreate the frontend container.
- Do not put `MODELDOCK_ADMIN_API_KEY` in a `NEXT_PUBLIC_*` variable. Use a dedicated browser-facing key if the UI needs one.
- If the UI loads but API calls fail in the browser, check that `NEXT_PUBLIC_API_URL` is reachable from the host (not `http://backend:8000`).

### Database and migration issues

Apply migrations after the database is healthy:

```bash
docker compose exec backend alembic upgrade head
```

If `docker compose exec backend pytest -q` fails with a PostgreSQL connection timeout, wait for the database and Redis healthchecks to finish and rerun the command.

If Alembic reports the database is out of date or tables are missing:

```bash
docker compose exec postgres pg_isready -U modeldock -d modeldock
docker compose exec backend alembic current
docker compose exec backend alembic upgrade head
```

A last resort for local-only data is to reset the volume (`docker compose down -v`) and start again. That deletes local Postgres and Redis data.

### Where to look for logs

| Component | Command |
| --- | --- |
| All services | `docker compose logs --tail=100` |
| API | `docker compose logs backend --tail=100` |
| Dashboard | `docker compose logs frontend --tail=100` |
| PostgreSQL | `docker compose logs postgres --tail=100` |
| Redis | `docker compose logs redis --tail=100` |

Follow a single service with `docker compose logs -f backend`.

## Code Style

Prefer small, readable changes that follow the existing project structure and conventions. Avoid unrelated refactors in feature or bug-fix pull requests.

For security-sensitive changes, explain the security impact without publishing exploit details in the pull request.

## Questions

If you are unsure about an implementation detail, open an issue or discussion before making a large change.
