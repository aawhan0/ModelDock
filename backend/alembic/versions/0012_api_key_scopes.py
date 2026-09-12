"""Add capability scopes to API keys.

Revision ID: 0012_api_key_scopes
Revises: 0011_artifact_integrity
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0012_api_key_scopes"
down_revision: Union[str, None] = "0011_artifact_integrity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_FULL_SCOPES = [
    "models:manage",
    "artifacts:manage",
    "inference:execute",
    "metrics:read",
    "experiments:manage",
]


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("scopes", sa.JSON(), nullable=True))
    table = sa.table("api_keys", sa.column("scopes", sa.JSON()))
    op.execute(table.update().values(scopes=_FULL_SCOPES))
    op.alter_column("api_keys", "scopes", existing_type=sa.JSON(), nullable=False)


def downgrade() -> None:
    op.drop_column("api_keys", "scopes")
