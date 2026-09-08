"""Migrate API key storage to Argon2 hashes.

Revision ID: 0007_api_key_argon2
Revises: 0006_add_inference_error
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_api_key_argon2"
down_revision: Union[str, None] = "0006_add_inference_error"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "api_keys",
        "key_hash",
        existing_type=sa.String(length=64),
        type_=sa.String(length=128),
        existing_nullable=False,
    )
    # Existing SHA-256 digests cannot be converted to Argon2 without the
    # original API keys. Invalidate them so no unusable credentials remain.
    op.execute(sa.text("DELETE FROM api_keys"))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM api_keys"))
    op.alter_column(
        "api_keys",
        "key_hash",
        existing_type=sa.String(length=128),
        type_=sa.String(length=64),
        existing_nullable=False,
    )
