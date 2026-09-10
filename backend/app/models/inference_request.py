from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class InferenceRequest(Base):
    __tablename__ = "inference_requests"
    __table_args__ = (
        Index(
            "ix_inference_requests_model_version_created_at",
            "model_id",
            "version",
            "created_at",
        ),
        Index("ix_inference_requests_idempotency_key", "idempotency_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[UUID] = mapped_column(unique=True, nullable=False)
    idempotency_key: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    response_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    response_status: Mapped[int | None] = mapped_column(nullable=True)
    model_id: Mapped[int] = mapped_column(
        ForeignKey("models.id", ondelete="CASCADE"), index=True, nullable=False
    )
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    endpoint: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    prediction_metric_id: Mapped[int | None] = mapped_column(
        ForeignKey("inference_metrics.id", ondelete="SET NULL"), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[float] = mapped_column(nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
