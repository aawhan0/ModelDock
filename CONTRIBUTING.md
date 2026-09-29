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

If `docker compose exec backend pytest -q` fails with a PostgreSQL connection timeout, wait a little longer for the database and Redis healthchecks to finish and then rerun the command.

- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- PostgreSQL: localhost:5433
- Redis: localhost:6379

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

## Code Style

Prefer small, readable changes that follow the existing project structure and conventions. Avoid unrelated refactors in feature or bug-fix pull requests.

For security-sensitive changes, explain the security impact without publishing exploit details in the pull request.

## Questions

If you are unsure about an implementation detail, open an issue or discussion before making a large change.
