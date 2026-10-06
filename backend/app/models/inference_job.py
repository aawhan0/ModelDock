from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InferenceJob(Base):
    __tablename__ = "inference_jobs"
    __table_args__ = (
        Index("ix_inference_jobs_model_version_created_at", "model_id", "version", "created_at"),
        Index("ix_inference_jobs_status", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[UUID] = mapped_column(unique=True, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    request_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    model_id: Mapped[int] = mapped_column(ForeignKey("models.id", ondelete="CASCADE"), index=True, nullable=False)
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    input_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    result_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_code: Mapped[int | None] = mapped_column(nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    prediction_metric_id: Mapped[int | None] = mapped_column(
        ForeignKey("inference_metrics.id", ondelete="SET NULL"), nullable=True
    )
    latency_ms: Mapped[float] = mapped_column(nullable=False, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)