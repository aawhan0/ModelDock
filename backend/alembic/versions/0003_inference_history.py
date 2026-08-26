"""Add inference history fields.

Revision ID: 0003_inference_history
Revises: 0002_persistent_metrics
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0003_inference_history"
down_revision: Union[str, None] = "0002_persistent_metrics"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inference_metrics", sa.Column("input_text", sa.Text(), nullable=False, server_default=""))
    op.add_column("inference_metrics", sa.Column("prediction", sa.Text(), nullable=True))
    op.alter_column("inference_metrics", "input_text", server_default=None)


def downgrade() -> None:
    op.drop_column("inference_metrics", "prediction")
    op.drop_column("inference_metrics", "input_text")
