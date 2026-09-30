"""Add asynchronous inference jobs.

Revision ID: 0007_inference_jobs
Revises: 0006_add_inference_error
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0007_inference_jobs"
down_revision: Union[str, None] = "0006_add_inference_error"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inference_jobs",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=True),
        sa.Column("input_payload", sa.Text(), nullable=False),
        sa.Column("prediction", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("model_id", "version", "idempotency_key", name="uq_inference_job_idempotency"),
    )
    op.create_index("ix_inference_jobs_model_id", "inference_jobs", ["model_id"], unique=False)
    op.create_index("ix_inference_jobs_status", "inference_jobs", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_inference_jobs_status", table_name="inference_jobs")
    op.drop_index("ix_inference_jobs_model_id", table_name="inference_jobs")
    op.drop_table("inference_jobs")
