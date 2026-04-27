# -*- coding: utf-8 -*-
"""011 - Columna auto_published en arqueo_headers.

Revision ID: 011
Revises: 010
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "arqueo_headers",
        sa.Column(
            "auto_published",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column("arqueo_headers", "auto_published")
