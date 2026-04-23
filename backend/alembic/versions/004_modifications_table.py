"""Modificaciones: arqueo_modifications

Revision ID: 004
Revises: 003
Create Date: 2026-04-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MODIFICATION_TYPE = ("add", "edit", "delete")


def upgrade() -> None:
    # ── arqueo_modifications ───────────────────────────────────────────────────
    op.create_table(
        "arqueo_modifications",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "arqueo_header_id",
            sa.Integer,
            sa.ForeignKey("arqueo_headers.id"),
            nullable=False,
        ),
        sa.Column(
            "arqueo_record_id",
            sa.Integer,
            sa.ForeignKey("arqueo_records.id"),
            nullable=True,
        ),
        sa.Column(
            "modification_type",
            sa.Enum(*MODIFICATION_TYPE, name="modification_type"),
            nullable=False,
        ),
        sa.Column(
            "reason_id",
            sa.Integer,
            sa.ForeignKey("modification_reasons.id"),
            nullable=False,
        ),
        sa.Column("reason_detail", sa.Text, nullable=True),
        sa.Column("previous_data", JSONB, nullable=True),
        sa.Column("new_data", JSONB, nullable=True),
        sa.Column(
            "created_by",
            sa.Integer,
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_mod_record_id", "arqueo_modifications", ["arqueo_record_id"]
    )
    op.create_index(
        "ix_mod_header_id", "arqueo_modifications", ["arqueo_header_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_mod_header_id", table_name="arqueo_modifications")
    op.drop_index("ix_mod_record_id", table_name="arqueo_modifications")
    op.drop_table("arqueo_modifications")
    op.execute("DROP TYPE IF EXISTS modification_type")
