"""Enforce one active deployment per model.

Revision ID: 0016_deployment_state_integrity
Revises: 0015_inference_idempotency
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0016_deployment_state_integrity"
down_revision: Union[str, None] = "0015_inference_idempotency"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_model_versions_one_deployed_per_model",
        "model_versions",
        ["model_id"],
        unique=True,
        postgresql_where=sa.text("status = 'deployed'"),
        sqlite_where=sa.text("status = 'deployed'"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_model_versions_one_deployed_per_model",
        table_name="model_versions",
    )
