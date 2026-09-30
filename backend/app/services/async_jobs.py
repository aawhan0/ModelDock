import json
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter
from typing import Any
from uuid import uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.models.inference_job import InferenceJob
from app.services.artifact_store import LocalArtifactStore
from app.services.metrics import metrics_collector, record_persistent_metric
from app.services.runtime_registry import runtime_registry

artifact_store = LocalArtifactStore()
executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="modeldock-inference")


def _safe_error(exc: Exception) -> str:
    if isinstance(exc, FileNotFoundError):
        return "Model artifact not found"
    if isinstance(exc, (ValueError, TypeError, SyntaxError)):
        return str(exc)
    return "Model inference failed"


def _run_job(job_id: str, session_factory: sessionmaker, artifact_store: LocalArtifactStore, framework: str, artifact_path: str, version: str, model_id: int) -> None:
    db = session_factory()
    started_at = perf_counter()
    job = db.get(InferenceJob, job_id)
    if job is None:
        db.close()
        return

    try:
        job.status = "running"
        db.commit()
        payload = json.loads(job.input_payload)
        runtime = runtime_registry.get(framework)
        loaded_model = runtime.get_or_load(str(artifact_store.resolve(artifact_path)))
        prediction = runtime.predict(loaded_model, payload)
        job.prediction = json.dumps(prediction, default=str)
        job.status = "completed"
        job.error = None
        success = True
    except Exception as exc:
        job.status = "failed"
        job.error = _safe_error(exc)
        job.prediction = None
        success = False

    latency_ms = (perf_counter() - started_at) * 1000
    job.latency_ms = latency_ms
    db.commit()
    metrics_collector.record(f"{model_id}:{version}", latency_ms, success)
    try:
        record_persistent_metric(
            db,
            model_id,
            version,
            latency_ms,
            success,
            input_text=job.input_payload,
            prediction=job.prediction,
            error=job.error,
        )
    except Exception:
        db.rollback()
    finally:
        db.close()


def enqueue_job(
    db: Session,
    model_id: int,
    version: str,
    framework: str,
    artifact_path: str,
    input_value: Any,
    idempotency_key: str | None,
    artifact_store: LocalArtifactStore,
) -> InferenceJob:
    if idempotency_key:
        existing = (
            db.query(InferenceJob)
            .filter(
                InferenceJob.model_id == model_id,
                InferenceJob.version == version,
                InferenceJob.idempotency_key == idempotency_key,
            )
            .first()
        )
        if existing is not None:
            return existing

    job = InferenceJob(
        id=str(uuid4()),
        model_id=model_id,
        version=version,
        idempotency_key=idempotency_key,
        input_payload=json.dumps(input_value, default=str),
        status="queued",
    )
    db.add(job)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if idempotency_key:
            existing = (
                db.query(InferenceJob)
                .filter(
                    InferenceJob.model_id == model_id,
                    InferenceJob.version == version,
                    InferenceJob.idempotency_key == idempotency_key,
                )
                .first()
            )
            if existing is not None:
                return existing
        raise
    db.refresh(job)
    session_factory = sessionmaker(bind=db.get_bind(), autoflush=False, autocommit=False)
    executor.submit(_run_job, job.id, session_factory, artifact_store, framework, artifact_path, version, model_id)
    return job


def decode_prediction(job: InferenceJob) -> Any:
    if job.prediction is None:
        return None
    return json.loads(job.prediction)