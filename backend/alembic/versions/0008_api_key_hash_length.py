"""Expand API key hash storage for Argon2 encoded hashes.

Revision ID: 0008_api_key_hash_length
Revises: 0007_api_key_argon2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_api_key_hash_length"
down_revision: Union[str, None] = "0007_api_key_argon2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "api_keys",
        "key_hash",
        existing_type=sa.String(length=128),
        type_=sa.String(length=255),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "api_keys",
        "key_hash",
        existing_type=sa.String(length=255),
        type_=sa.String(length=128),
        existing_nullable=False,
    )
