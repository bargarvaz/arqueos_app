# -*- coding: utf-8 -*-
"""013 - Saldo inicial desglosado por denominación en vaults.

Revision ID: 013
Revises: 012
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


_DENOMINATION_FIELDS = [
    "initial_bill_1000",
    "initial_bill_500",
    "initial_bill_200",
    "initial_bill_100",
    "initial_bill_50",
    "initial_bill_20",
    "initial_coin_100",
    "initial_coin_50",
    "initial_coin_20",
    "initial_coin_10",
    "initial_coin_5",
    "initial_coin_2",
    "initial_coin_1",
    "initial_coin_050",
    "initial_coin_020",
    "initial_coin_010",
]


def upgrade() -> None:
    for field in _DENOMINATION_FIELDS:
        op.add_column(
            "vaults",
            sa.Column(
                field,
                sa.Numeric(15, 2),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )


def downgrade() -> None:
    for field in _DENOMINATION_FIELDS:
        op.drop_column("vaults", field)
