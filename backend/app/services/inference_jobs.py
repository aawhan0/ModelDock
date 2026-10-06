import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from time import perf_counter
from uuid import UUID
from typing import Any

from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.inference_job import InferenceJob
from app.models.model import ModelVersion
from app.services.artifact_store import LocalArtifactStore, verify_artifact
from app.services.metrics import record_persistent_metric
from app.services.runtime_registry import runtime_registry

artifact_store = LocalArtifactStore()
job_executor = ThreadPoolExecutor(max_workers=settings.inference_job_workers, thread_name_prefix="inference-job")


def _safe_error(exc: Exception) -> tuple[int, str]:
    if isinstance(exc, FileNotFoundError):
        return 404, "Model artifact not found"
    if isinstance(exc, asyncio.TimeoutError):
        return 504, "Model inference timed out"
    if isinstance(exc, ValueError):
        return 422, "Model rejected the input"
    if isinstance(exc, TypeError | SyntaxError):
        return 422, "Model input is invalid"
    if isinstance(exc, RuntimeError) and str(exc) in {
        "Model artifact integrity check failed",
        "Model version is no longer deployed",
    }:
        return 409, str(exc)
    return 500, "Model inference failed"


async def _execute(runtime: Any, artifact_path: str, value: Any) -> Any:
    loaded_model = await asyncio.wait_for(
        asyncio.to_thread(runtime.get_or_load, artifact_path),
        timeout=settings.inference_timeout_seconds,
    )
    return await asyncio.wait_for(
        asyncio.to_thread(runtime.predict, loaded_model, value),
        timeout=settings.inference_timeout_seconds,
    )


def _finish_job(
    db: Session,
    job: InferenceJob,
    *,
    status: str,
    started_at: float,
    result: Any = None,
    error_code: int | None = None,
    error_message: str | None = None,
) -> None:
    latency_ms = round((perf_counter() - started_at) * 1000, 3)
    prediction_metric_id = record_persistent_metric(
        db,
        job.model_id,
        job.version,
        latency_ms,
        status == "completed",
        input_text=str(job.input_payload.get("input", "")),
        prediction=None if result is None else str(result),
        error=error_message,
    )
    job.status = status
    job.latency_ms = latency_ms
    job.prediction_metric_id = prediction_metric_id
    job.error_code = error_code
    job.error_message = error_message
    job.result_payload = (
        {"prediction": result, "prediction_id": prediction_metric_id, "latency_ms": latency_ms}
        if status == "completed"
        else None
    )
    job.completed_at = datetime.now(timezone.utc)
    db.commit()


def run_inference_job(job_id: UUID, bind: Any = None) -> None:
    db = Session(bind=bind) if bind is not None else SessionLocal()
    started_at = perf_counter()
    try:
        job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
        if job is None or job.status != "queued":
            return
        job.status = "running"
        job.started_at = datetime.now(timezone.utc)
        db.commit()

        model_version = (
            db.query(ModelVersion)
            .filter(ModelVersion.model_id == job.model_id, ModelVersion.version == job.version)
            .first()
        )
        if model_version is None or model_version.status != "deployed" or not model_version.artifact_path:
            raise RuntimeError("Model version is no longer deployed")
        artifact_path = artifact_store.resolve(model_version.artifact_path)
        if model_version.artifact_sha256 and not verify_artifact(
            artifact_path, model_version.artifact_sha256, model_version.artifact_size_bytes
        ):
            raise RuntimeError("Model artifact integrity check failed")
        runtime = runtime_registry.get(model_version.framework)
        result = asyncio.run(_execute(runtime, str(artifact_path), job.input_payload["input"]))
        _finish_job(db, job, status="completed", started_at=started_at, result=result)
    except Exception as exc:
        db.rollback()
        job = db.query(InferenceJob).filter(InferenceJob.job_id == job_id).first()
        if job is not None and job.status == "running":
            error_code, error_message = _safe_error(exc)
            _finish_job(
                db,
                job,
                status="failed",
                started_at=started_at,
                error_code=error_code,
                error_message=error_message,
            )
    finally:
        db.close()


def submit_inference_job(job_id: UUID, bind: Any = None) -> None:
    job_executor.submit(run_inference_job, job_id, bind)


def shutdown_inference_jobs() -> None:
    job_executor.shutdown(wait=False, cancel_futures=True)