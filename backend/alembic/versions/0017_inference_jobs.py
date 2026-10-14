"""Add asynchronous inference jobs.

Revision ID: 0017_inference_jobs
Revises: 0016_deployment_state_integrity
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017_inference_jobs"
down_revision: Union[str, None] = "0016_deployment_state_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inference_jobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("request_hash", sa.String(length=64), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("input_payload", sa.JSON(), nullable=False),
        sa.Column("result_payload", sa.JSON(), nullable=True),
        sa.Column("error_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("prediction_metric_id", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prediction_metric_id"], ["inference_metrics.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("job_id", name="uq_inference_jobs_job_id"),
        sa.UniqueConstraint("idempotency_key", name="uq_inference_jobs_idempotency_key"),
    )
    op.create_index("ix_inference_jobs_model_id", "inference_jobs", ["model_id"], unique=False)
    op.create_index("ix_inference_jobs_model_version_created_at", "inference_jobs", ["model_id", "version", "created_at"], unique=False)
    op.create_index("ix_inference_jobs_status", "inference_jobs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_inference_jobs_status", table_name="inference_jobs")
    op.drop_index("ix_inference_jobs_model_version_created_at", table_name="inference_jobs")
    op.drop_index("ix_inference_jobs_model_id", table_name="inference_jobs")
    op.drop_table("inference_jobs")