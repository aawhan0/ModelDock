"""Add deployment status to model versions.

Revision ID: 0005_deployment_status
Revises: 0004_api_keys
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005_deployment_status"
down_revision: Union[str, None] = "0004_api_keys"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "model_versions",
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="uploaded",
        ),
    )


def downgrade() -> None:
    op.drop_column("model_versions", "status")
