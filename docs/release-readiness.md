# ModelDock release readiness

This checklist is the final pre-release pass for ModelDock. It is intentionally operational rather than feature-oriented.

## Backend

- [ ] `alembic upgrade head` completes from a clean database.
- [ ] `alembic check` reports no pending schema changes.
- [ ] `alembic downgrade -1 && alembic upgrade head` succeeds.
- [ ] Backend tests pass with coverage enabled.
- [ ] API contract tests pass.
- [ ] `/health` and `/ready` report the expected dependency and artifact-integrity state.
- [ ] Production inference limits are configured for the deployment environment.
- [ ] Rate limiting is enabled and backed by the intended Redis instance in production.
- [ ] CORS origins are restricted to the deployed frontend origins.
- [ ] API authentication is enabled outside local development.

## Frontend

- [ ] `npm ci` succeeds from the lockfile.
- [ ] `npm audit --audit-level=high` is clean or reviewed before release.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] Dashboard, model registry, inference, monitoring, settings, and documentation routes load successfully.
- [ ] Loading, empty, error, and retry states are usable without browser-console errors.
- [ ] The ModelDock brand mark is visible in the sidebar and remains legible on supported themes.

## Production deployment

- [ ] Production backend and frontend images build successfully.
- [ ] Container health checks reach `healthy` before traffic is enabled.
- [ ] Database migrations run before application traffic is switched over.
- [ ] Artifact storage is persistent and backed up according to the deployment environment.
- [ ] Redis is persistent enough for the selected rate-limit and idempotency requirements.
- [ ] Ingress enforces a request-body limit, including chunked requests that do not provide `Content-Length`.
- [ ] Process isolation or worker-level controls are used when hard execution termination is required. The application inference timeout bounds the request wait, but cannot terminate an already-running Python worker thread.
- [ ] Logs include request IDs and do not expose credentials, API keys, or raw model inputs.

## Release evidence

Record the following with the release:

- Git commit or tag.
- Database migration revision.
- Backend test result and coverage percentage.
- Frontend typecheck/build result.
- Container image identifiers.
- Production configuration changes.
- Any accepted security or dependency exceptions.
