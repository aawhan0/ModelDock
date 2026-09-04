"""Add error field to inference metrics.

Revision ID: 0006_add_inference_error
Revises: 0005_deployment_status
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_add_inference_error"
down_revision: Union[str, None] = "0005_deployment_status"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "inference_metrics",
        sa.Column("error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inference_metrics", "error")
