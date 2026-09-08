"""Add datasets, experiments, and training-run lineage.

Revision ID: 0009_experiment_lineage
Revises: 0008_api_key_hash_length
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_experiment_lineage"
down_revision: Union[str, None] = "0008_api_key_hash_length"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "datasets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("version", sa.String(length=100), nullable=False),
        sa.Column("uri", sa.String(length=500), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("name", "version", name="uq_datasets_name_version"),
    )
    op.create_index("ix_datasets_name", "datasets", ["name"], unique=False)

    op.create_table(
        "experiments",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="planned", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('planned', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_experiments_status",
        ),
    )
    op.create_index("ix_experiments_name", "experiments", ["name"], unique=False)

    op.create_table(
        "experiment_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("experiment_id", sa.Integer(), nullable=False),
        sa.Column("model_version_id", sa.Integer(), nullable=True),
        sa.Column("dataset_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="queued", nullable=False),
        sa.Column("parameters", sa.JSON(), nullable=False),
        sa.Column("metrics", sa.JSON(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["experiment_id"], ["experiments.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["model_version_id"], ["model_versions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["dataset_id"], ["datasets.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("experiment_id", "name", name="uq_experiment_runs_experiment_name"),
        sa.CheckConstraint(
            "status IN ('queued', 'running', 'completed', 'failed', 'cancelled')",
            name="ck_experiment_runs_status",
        ),
    )
    op.create_index("ix_experiment_runs_experiment_id", "experiment_runs", ["experiment_id"], unique=False)
    op.create_index("ix_experiment_runs_model_version_id", "experiment_runs", ["model_version_id"], unique=False)
    op.create_index("ix_experiment_runs_dataset_id", "experiment_runs", ["dataset_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_experiment_runs_dataset_id", table_name="experiment_runs")
    op.drop_index("ix_experiment_runs_model_version_id", table_name="experiment_runs")
    op.drop_index("ix_experiment_runs_experiment_id", table_name="experiment_runs")
    op.drop_table("experiment_runs")
    op.drop_index("ix_experiments_name", table_name="experiments")
    op.drop_table("experiments")
    op.drop_index("ix_datasets_name", table_name="datasets")
    op.drop_table("datasets")
