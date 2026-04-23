"""Arqueos: arqueo_headers y arqueo_records

Revision ID: 003
Revises: 002
Create Date: 2026-04-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ENUMs
ARQUEO_STATUS = ("draft", "published", "locked")
COUNTERPART_TYPE = ("cancellation", "modification")


def upgrade() -> None:
    # ── arqueo_status ENUM ─────────────────────────────────────────────────────
    op.execute(
        "CREATE TYPE arqueo_status AS ENUM ('draft', 'published', 'locked')"
    )

    # ── counterpart_type ENUM ─────────────────────────────────────────────────
    op.execute(
        "CREATE TYPE counterpart_type AS ENUM ('cancellation', 'modification')"
    )

    # ── arqueo_headers ─────────────────────────────────────────────────────────
    op.create_table(
        "arqueo_headers",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "vault_id",
            sa.Integer,
            sa.ForeignKey("vaults.id"),
            nullable=False,
            index=True,
        ),
        sa.Column("arqueo_date", sa.Date, nullable=False),
        sa.Column(
            "opening_balance",
            sa.Numeric(15, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "closing_balance",
            sa.Numeric(15, 2),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "status",
            sa.Enum(*ARQUEO_STATUS, name="arqueo_status", create_type=False),
            nullable=False,
            server_default="draft",
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.UniqueConstraint("vault_id", "arqueo_date", name="uq_vault_date"),
    )
    op.create_index(
        "ix_header_vault_date", "arqueo_headers", ["vault_id", "arqueo_date"]
    )

    # ── arqueo_records ─────────────────────────────────────────────────────────
    op.create_table(
        "arqueo_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("record_uid", sa.String(6), nullable=False, unique=True, index=True),
        sa.Column(
            "arqueo_header_id",
            sa.Integer,
            sa.ForeignKey("arqueo_headers.id"),
            nullable=False,
        ),
        sa.Column("voucher", sa.String(100), nullable=False),
        sa.Column("reference", sa.String(100), nullable=False),
        sa.Column(
            "branch_id",
            sa.Integer,
            sa.ForeignKey("branches.id"),
            nullable=False,
        ),
        sa.Column("entries", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("withdrawals", sa.Numeric(15, 2), nullable=False, server_default="0"),
        # Billetes
        sa.Column("bill_1000", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("bill_500", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("bill_200", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("bill_100", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("bill_50", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("bill_20", sa.Numeric(15, 2), nullable=False, server_default="0"),
        # Monedas
        sa.Column("coin_100", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_50", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_20", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_10", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_5", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_2", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_1", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_050", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_020", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("coin_010", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column(
            "movement_type_id",
            sa.Integer,
            sa.ForeignKey("movement_types.id"),
            nullable=False,
        ),
        # Contrapartida
        sa.Column("is_counterpart", sa.Boolean, nullable=False, server_default="false"),
        sa.Column(
            "counterpart_type",
            sa.Enum(*COUNTERPART_TYPE, name="counterpart_type", create_type=False),
            nullable=True,
        ),
        sa.Column("original_record_uid", sa.String(6), nullable=True),
        sa.Column("record_date", sa.Date, nullable=False),
        sa.Column(
            "upload_date",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
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
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
        sa.CheckConstraint(
            "(entries > 0 AND withdrawals = 0) OR "
            "(entries = 0 AND withdrawals > 0) OR "
            "(entries = 0 AND withdrawals = 0)",
            name="chk_entries_withdrawals_exclusive",
        ),
    )
    op.create_index(
        "ix_record_header_id", "arqueo_records", ["arqueo_header_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_record_header_id", table_name="arqueo_records")
    op.drop_table("arqueo_records")
    op.drop_index("ix_header_vault_date", table_name="arqueo_headers")
    op.drop_table("arqueo_headers")
    op.execute("DROP TYPE IF EXISTS counterpart_type")
    op.execute("DROP TYPE IF EXISTS arqueo_status")
