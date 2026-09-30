# Deployment state integrity

ModelDock maintains one active deployment per model.

## Deployment invariant

For each model, at most one `model_versions` row may have `status = deployed`.

The database enforces this with a partial unique index on `model_versions.model_id`. This is an intentional safety boundary: application logic retires the previous version during deploy or rollback, while the database prevents concurrent requests from leaving multiple versions active.

## Deploy and rollback

A deployment or rollback:

1. Validates the target artifact and its persisted integrity metadata.
2. Evaluates the configured deployment policy where applicable.
3. Retires the currently deployed version.
4. Marks the target version as deployed.
5. Records the transition in deployment history.

If another deployment change wins the race first, the database constraint rejects the conflicting transaction and the API returns a safe `409 Conflict`. Clients should refresh the model state and retry against the current deployment state.

## Operational expectation

The invariant is enforced at the database layer rather than relying only on API request ordering. This protects the deployment state even if multiple application workers receive deployment requests concurrently.
