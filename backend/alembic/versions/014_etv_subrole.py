# -*- coding: utf-8 -*-
"""014 - ETV subrol gerente/tesorero.

Revision ID: 014
Revises: 013
Create Date: 2026-04-27
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    etv_subrole = sa.Enum("gerente", "tesorero", name="etv_subrole")
    etv_subrole.create(op.get_bind(), checkfirst=True)
    op.add_column(
        "users",
        sa.Column("etv_subrole", etv_subrole, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "etv_subrole")
    sa.Enum(name="etv_subrole").drop(op.get_bind(), checkfirst=True)
