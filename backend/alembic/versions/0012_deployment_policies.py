"""Add model deployment evaluation gates.

Revision ID: 0012_deployment_policies
Revises: 0011_artifact_integrity
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0012_deployment_policies"
down_revision: Union[str, None] = "0011_artifact_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deployment_policies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("model_id", sa.Integer(), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("minimum_metrics", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["model_id"], ["models.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("model_id", name="uq_deployment_policies_model_id"),
    )
    op.create_index(
        "ix_deployment_policies_model_id",
        "deployment_policies",
        ["model_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_deployment_policies_model_id", table_name="deployment_policies")
    op.drop_table("deployment_policies")
