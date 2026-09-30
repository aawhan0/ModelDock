# Contributing to ModelDock

Thanks for taking an interest in ModelDock.

ModelDock is a self-hostable ML model serving platform. Contributions that improve correctness, security, documentation, developer experience, or maintainability are welcome.

## Before You Start

- Check existing issues and pull requests before starting substantial work.
- For larger changes, open an issue first so the approach can be discussed.
- Keep pull requests focused on one change.
- Do not include secrets, credentials, private data, or generated build artifacts.

## Development

Clone the repository and start the local services using the setup documented in [README.md](README.md). Keep API authentication enabled outside local development and never commit `.env` files, credentials, model inputs, or generated artifacts.

## Verification

Run the checks relevant to your change before opening a pull request. The required CI checks are:

```powershell
# Backend
cd backend
pip install -r requirements.txt pytest-cov ruff
pip check
ruff check app tests --select E9,F63,F7,F82
python -m compileall -q app tests
alembic upgrade head
alembic check
alembic downgrade -1
alembic upgrade head
pytest -q --cov=app

# Frontend
cd ..\frontend
npm ci
npm audit --audit-level=high
npm run typecheck
npm run build

# Repository and Docker checks, from the repository root
cd ..
git diff --check
docker compose config --quiet
docker compose build --pull
```

The backend and Docker checks require a PostgreSQL service as described in `docker-compose.yml`. Use `docker compose up -d` for the complete local stack, then apply migrations with `docker compose exec backend alembic upgrade head`.

## Pull Requests

Please include a short explanation of what changed, why it changed, and how it was verified. Update documentation when behavior or public APIs change.

Open pull requests against `main`. Keep the title specific and the scope focused. Pull requests should pass the required CI checks before merging; do not bypass a failing check without explaining the reason and follow-up plan.

## Code Style

Prefer small, readable changes that follow the existing project structure and conventions. Avoid unrelated refactors in feature or bug-fix pull requests.

For security-sensitive changes, explain the security impact without publishing exploit details in the pull request.

Do not report security vulnerabilities in a public issue or pull request. Follow the private process in [SECURITY.md](SECURITY.md). Changes involving uploaded artifacts, authentication, API keys, restricted Python execution, or model inference should include focused regression coverage and a short security-impact note for reviewers.

## Questions

If you are unsure about an implementation detail, open an issue or discussion before making a large change.
