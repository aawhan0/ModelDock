"""Add inference idempotency persistence.

Revision ID: 0015_inference_idempotency
Revises: 0014_inference_request_tracking
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0015_inference_idempotency"
down_revision: Union[str, None] = "0014_inference_request_tracking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("inference_requests", sa.Column("idempotency_key", sa.String(length=255), nullable=True))
    op.add_column("inference_requests", sa.Column("request_hash", sa.String(length=64), nullable=True))
    op.add_column("inference_requests", sa.Column("response_payload", sa.JSON(), nullable=True))
    op.add_column("inference_requests", sa.Column("response_status", sa.Integer(), nullable=True))
    op.create_unique_constraint(
        "uq_inference_requests_idempotency_key",
        "inference_requests",
        ["idempotency_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_inference_requests_idempotency_key", "inference_requests", type_="unique")
    op.drop_column("inference_requests", "response_status")
    op.drop_column("inference_requests", "response_payload")
    op.drop_column("inference_requests", "request_hash")
    op.drop_column("inference_requests", "idempotency_key")
