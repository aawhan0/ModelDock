"""Add persistent inference metrics.

Revision ID: 0002_persistent_metrics
Revises: 0001_model_registry
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_persistent_metrics"
down_revision: Union[str, None] = "0001_model_registry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inference_metrics",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_inference_metrics_model_id", "inference_metrics", ["model_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_inference_metrics_model_id", table_name="inference_metrics")
    op.drop_table("inference_metrics")
