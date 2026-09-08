"""Add immutable artifact integrity metadata.

Revision ID: 0011_artifact_integrity
Revises: 0010_deployment_audit
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0011_artifact_integrity"
down_revision: Union[str, None] = "0010_deployment_audit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("model_versions", sa.Column("artifact_sha256", sa.String(length=64), nullable=True))
    op.add_column("model_versions", sa.Column("artifact_size_bytes", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("model_versions", "artifact_size_bytes")
    op.drop_column("model_versions", "artifact_sha256")
