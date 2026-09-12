"""Add persistent inference request tracking.

Revision ID: 0014_inference_request_tracking
Revises: 0013_deployment_policies
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0014_inference_request_tracking"
down_revision: Union[str, None] = "0013_deployment_policies"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inference_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("endpoint", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("prediction_metric_id", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["prediction_metric_id"], ["inference_metrics.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("request_id", name="uq_inference_requests_request_id"),
    )
    op.create_index("ix_inference_requests_model_id", "inference_requests", ["model_id"], unique=False)
    op.create_index(
        "ix_inference_requests_model_version_created_at",
        "inference_requests",
        ["model_id", "version", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_inference_requests_model_version_created_at", table_name="inference_requests")
    op.drop_index("ix_inference_requests_model_id", table_name="inference_requests")
    op.drop_table("inference_requests")
