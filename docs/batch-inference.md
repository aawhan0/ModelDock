# Batch inference

ModelDock supports bounded batch prediction for clients that need to submit multiple inputs in one HTTP request.

## Endpoint

```text
POST /api/v1/models/{modelId}/versions/{version}/predict/batch
```

Request:

```json
{
  "inputs": [
    "good model",
    "another example",
    "third example"
  ]
}
```

The response preserves input order and reports per-item success or failure:

```json
{
  "model": "example-model",
  "version": "v1",
  "total": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    {"index": 0, "success": true, "prediction": "positive"},
    {"index": 1, "success": true, "prediction": "negative"},
    {"index": 2, "success": true, "prediction": "positive"}
  ]
}
```

## Safety and operational behavior

- Batch size is bounded by `MODELDOCK_MAX_BATCH_SIZE` and defaults to 100.
- The configured maximum is capped at 1000 by application settings.
- Inputs are processed in request order so result indexes are deterministic.
- Each item uses the same deployed-version checks and artifact-integrity verification as single prediction requests.
- Each item contributes to the normal persistent inference metrics, so existing monitoring and history continue to represent actual prediction volume.
- A missing model, missing version, or non-deployed version fails the batch request because the request-level serving target is invalid.
- An individual prediction failure is returned in its result item so one bad input does not hide successful predictions from the same batch.

Batch inference is intentionally bounded and sequential. This keeps runtime behavior predictable across the supported Python, JSON, and scikit-learn runtimes. It is not presented as a high-throughput distributed inference scheduler.
