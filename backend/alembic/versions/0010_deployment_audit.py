"""Add deployment transition audit history.

Revision ID: 0010_deployment_audit
Revises: 0009_experiment_lineage
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0010_deployment_audit"
down_revision: Union[str, None] = "0009_experiment_lineage"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "deployment_events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("model_version_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("previous_version", sa.String(length=50), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["model_version_id"], ["model_versions.id"], ondelete="CASCADE"),
        sa.CheckConstraint(
            "action IN ('deploy', 'rollback', 'undeploy')",
            name="ck_deployment_events_action",
        ),
    )
    op.create_index(
        "ix_deployment_events_model_version_id",
        "deployment_events",
        ["model_version_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_deployment_events_model_version_id", table_name="deployment_events")
    op.drop_table("deployment_events")
