# Model lifecycle walkthrough

This guide follows one model through the full ModelDock lifecycle: register it, upload a version, deploy it, run a prediction, and look at the recorded metrics and history. Every step shows the API call and the matching dashboard steps.

For the state rules behind these steps, see the lifecycle diagram in the [README](../README.md#model-lifecycle). For the monitoring endpoints in depth, see [Production monitoring](production-monitoring.md).

## Before you start

You need the local stack from the [README](../README.md#run-locally) running, with migrations applied:

```bash
cp .env.example .env
docker compose up -d
docker compose exec backend alembic upgrade head
```

| Setting | Where | Purpose |
| --- | --- | --- |
| `MODELDOCK_ADMIN_API_KEY` | `.env` | Admin key. Send it as `Authorization: Bearer <key>` on every `/api/v1` call. |
| `MODELDOCK_API_AUTH_ENABLED` | `.env` | `true` by default. Requests without a valid key get `401`. |
| `MODELDOCK_MAX_ARTIFACT_SIZE_BYTES` | `.env` | Largest accepted artifact. Default 52428800 (50 MiB). |
| `NEXT_PUBLIC_API_URL` | `.env` | Backend URL used by the dashboard. Default `http://localhost:8000`. |
| `NEXT_PUBLIC_MODELDOCK_API_KEY` | `.env` | Key the dashboard sends. Leave it empty and every dashboard call fails with `401` while auth is enabled. Use a dedicated key, never the admin key (see [Troubleshooting](../CONTRIBUTING.md#frontend-environment-variables)). |

The API listens on `http://localhost:8000` and the dashboard on `http://localhost:3000`. The commands below use these shell variables:

```bash
export API=http://localhost:8000/api/v1
export KEY=YOUR_API_KEY
```

Errors from the API use this shape, with the HTTP status repeated in `code`:

```json
{"error": {"code": 409, "message": "Model version is not deployed"}}
```

> **Known issue:** with the default artifact store, deploy can fail with `Model version is not deployable: Model artifact integrity check failed` even though the upload succeeded. This is tracked in [#88](https://github.com/aawhan0/ModelDock/issues/88). Steps 3 to 5 cannot complete on an affected checkout until that is fixed.

## 1. Register a model

A model is a named record. It holds no files; those belong to versions.

**API:**

```bash
curl -X POST $API/models \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "greeting-model", "task": "text-classification", "description": "optional"}'
```

`name` and `task` are required (1 to 100 characters, not blank). `description` is optional. The name must be unique.

```json
{"name": "greeting-model", "task": "text-classification", "description": null, "id": 1, "created_at": "2026-10-26T23:35:31"}
```

Keep the numeric `id`; it is the `MODEL_ID` in every later URL. A duplicate name returns `409 Model name already exists`.

**Dashboard**: open `http://localhost:3000`, click **New Model**, fill in the identifier, task type, and description, then click **Save Model**. The model's `id` appears in its page URL, `/models/{id}`.

## 2. Create a version and upload the artifact

A version has a label you choose (`v1`), a runtime (`framework`), and one artifact file. Creating the version and uploading the file are two calls.

**API:**

```bash
curl -X POST $API/models/MODEL_ID/versions \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"version": "v1", "framework": "json"}'
```

```json
{"version": "v1", "artifact_path": "", "artifact_sha256": null, "artifact_size_bytes": null, "framework": "json", "id": 1, "model_id": 1, "status": "uploaded", "created_at": "2026-10-26T23:35:32"}
```

`framework` selects the runtime and must be `python`, `json`, or `sklearn` (case-insensitive). A repeated version label for the same model returns `409 Model version already exists`.

Next, upload the file as multipart form data with the field name `file`. Save this as `model.json`:

```json
{"predictions": {"hello": "positive", "goodbye": "negative"}}
```

```bash
curl -X POST $API/models/MODEL_ID/versions/v1/artifact \
  -H "Authorization: Bearer $KEY" \
  -F "file=@model.json"
```

```json
{"artifact_path": "artifacts/greeting-model/v1/<uuid>-model.json"}
```

What the upload checks:

- The file must not be empty (`422`) and must not exceed `MODELDOCK_MAX_ARTIFACT_SIZE_BYTES` (`413`).
- The runtime loads the file. If that fails you get `422 Invalid json artifact: ...`. A version whose `framework` is not supported returns `422 Unsupported model framework: ...`.
- The backend does not check the file extension. The dashboard file picker only offers `.joblib`, `.json`, and `.py`.
- On success the version becomes `validated`, and its SHA-256 and size are stored.
- Uploading again to a `validated` or `retired` version replaces the artifact. Uploading to a `deployed` version returns `409`.

What each runtime expects in the file:

| `framework` | Artifact |
| --- | --- |
| `json` | A JSON object with a `predictions` object that maps an input (compared as a string) to a result. |
| `python` | Python source that defines a callable named `model`. It runs under the [restricted policy](../README.md#python). |
| `sklearn` | A joblib file holding an object with a `predict` method. |

**Dashboard**: open the model, click **+ Upload New Version**, enter a version tag, choose a framework (`sklearn`, `python`, or `json`), pick the file, and click **Upload & Register**. The dashboard makes the same two calls and the version shows as **VALIDATED**.

## 3. Deploy a version

Only a `validated` version can be deployed.

**API:**

```bash
curl -X POST $API/models/MODEL_ID/versions/v1/deploy \
  -H "Authorization: Bearer $KEY"
```

The response is the version with `"status": "deployed"`. Deploying an already deployed version returns it unchanged.

Deploying a version retires any other deployed version of the same model, so a model has at most one deployed version. A deploy is recorded and can be read back:

```bash
curl $API/models/MODEL_ID/versions/v1/deployment-history -H "Authorization: Bearer $KEY"
```

```json
[{"id": 1, "action": "deploy", "version": "v1", "previous_version": null, "created_at": "2026-10-26T23:35:36"}]
```

Common failures, all `409`:

| Message | Cause |
| --- | --- |
| `Model version has no artifact` | Nothing was uploaded yet. |
| `Only validated model versions can be deployed` | The version is `uploaded` or `retired`. Re-upload, or call `POST .../revalidate` on a retired version. |
| `Deployment policy rejected model version: ...` | A [deployment policy](../README.md#deployment-quality-gates) is enabled and the version does not meet it. |
| `Model version is not deployable: ...` | The artifact failed the integrity check or could not be loaded. |

To take a version out of service, `POST .../undeploy`. It becomes `retired` and rejects predictions.

**Dashboard**: on the model page, click **Deploy** next to a validated version. The status changes to **DEPLOYED**, and the page shows the version's prediction endpoint.

## 4. Run a prediction

**API:**

```bash
curl -X POST $API/models/MODEL_ID/versions/v1/predict \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input": "hello"}'
```

`input` can be any JSON value. For `json` it is turned into a string and looked up; for `python` it is passed to `model`; for `sklearn` it is passed as one sample, `predict([input])`.

```json
{"model": "greeting-model", "version": "v1", "prediction": "positive", "prediction_id": 1, "request_id": "6859c3a5-8b21-46cf-88a7-8606534e736d", "latency_ms": 39.114}
```

`prediction_id` is the ID of the stored record in the history. `request_id` is generated for you, or taken from an `X-Request-ID` header if you send a UUID. Look up a past request with `GET $API/metrics/requests/REQUEST_ID`.

Failed predictions are recorded too. For example, an input the JSON artifact does not list returns:

```json
{"error": {"code": 422, "message": "No prediction configured for input: unknown"}}
```

Other statuses: `404` (unknown model or version), `409 Model version is not deployed`, `504` (timed out after `MODELDOCK_INFERENCE_TIMEOUT_SECONDS`, default 30), and `413` (request body over `MODELDOCK_MAX_INFERENCE_PAYLOAD_BYTES`, default 1 MiB).

For batches and background jobs, see `POST .../predict/batch` ([Batch inference](batch-inference.md)) and `POST .../predict/async`.

**Dashboard**: click **Inference** on the model page (route `/inference/{modelId}/{version}`). Enter a payload such as `{"input": "hello"}`, then click **Run Prediction**. The page shows the model, version, and prediction from the response, and updates the request counts.

## 5. View metrics and history

Each prediction, successful or not, is stored. All of these are `GET` requests with the same bearer key, and they need the `metrics:read` scope (the admin key has it).

```bash
curl $API/metrics/MODEL_ID/v1 -H "Authorization: Bearer $KEY"
```

```json
{"model_id": 1, "version": "v1", "requests": 2, "successful": 1, "failed": 1, "average_latency_ms": 40.429}
```

| Endpoint | Returns |
| --- | --- |
| `/metrics/{id}/{version}` | Lifetime totals, as above. |
| `/metrics/{id}/{version}/history?limit=50` | Newest-first records: `id`, `input`, `prediction`, `error`, `success`, `latency_ms`, `created_at`. `limit` is 1 to 100. |
| `/metrics/{id}/{version}/monitoring?hours=24` | Window summary: success and error rate, average and p50/p95/p99 latency, throughput, `alerts`, `healthy`. `hours` is 1 to 168. |
| `/metrics/{id}/{version}/timeseries?hours=24` | One bucket per hour: `timestamp`, `requests`, `successful`, `failed`, `average_latency_ms`. |
| `/metrics/{id}/{version}/predictions` | Count and share of each successful prediction. |
| `/metrics/{id}/{version}/drift` | PSI drift report. Returns `"status": "insufficient_data"` until enough successful requests exist. |

History after the two requests above:

```json
[
  {"id": 2, "input": "unknown", "prediction": null, "error": "No prediction configured for input: unknown", "success": false, "latency_ms": 41.744, "created_at": "2026-10-26T23:35:39"},
  {"id": 1, "input": "hello", "prediction": "positive", "error": null, "success": true, "latency_ms": 39.114, "created_at": "2026-10-26T23:35:37"}
]
```

Monitoring for the same window:

```json
{"model_id": 1, "version": "v1", "window_hours": 24, "requests": 2, "successful": 1, "failed": 1, "success_rate": 0.5, "error_rate": 0.5, "average_latency_ms": 40.429, "p50_latency_ms": 40.429, "p95_latency_ms": 41.612, "p99_latency_ms": 41.718, "throughput_requests_per_minute": 0.0014, "alerts": ["error_rate"], "healthy": false}
```

`alerts` contains `error_rate` or `p95_latency` when the window crosses `MODELDOCK_MONITORING_ERROR_RATE_THRESHOLD` (default 0.05) or `MODELDOCK_MONITORING_P95_LATENCY_MS` (default 1000). With one failure in two requests, the error rate is 0.5, so this window is flagged.

**Dashboard:**

- **History** (`/history/{modelId}/{version}`): the recorded requests for the version.
- **Monitoring** (`/monitoring/{modelId}/{version}`): metrics for the selected window (1H, 6H, 24H, or 7D), a drift report, and recent failures. It loads the `timeseries`, `history`, and `drift` endpoints above, not `/monitoring`. Use **Refresh** or turn on **Auto refresh** (every 10 seconds) to see new requests. Opening `/monitoring` with no model asks you to choose one.

Both pages are for the version in the URL. The model page links to them from its **Metrics** (Monitoring) and **History** tabs.

## Cleaning up

```bash
curl -X POST $API/models/MODEL_ID/versions/v1/undeploy -H "Authorization: Bearer $KEY"
curl -X DELETE $API/models/MODEL_ID/versions/v1 -H "Authorization: Bearer $KEY"   # 204; deployed versions return 409
curl -X DELETE $API/models/MODEL_ID -H "Authorization: Bearer $KEY"               # 204; deletes all versions
```
