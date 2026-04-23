# -*- coding: utf-8 -*-
"""Agrega columna puesto a la tabla users.

Revision ID: 008
Revises: 007
Create Date: 2026-04-23
"""

from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("puesto", sa.String(150), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "puesto")
