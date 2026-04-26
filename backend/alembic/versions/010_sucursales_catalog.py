# -*- coding: utf-8 -*-
"""010 - Catálogo sucursales + renombrar branch_id → sucursal_id en arqueo_records.

Revision ID: 010
Revises: 009
Create Date: 2026-04-26
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Crear tabla sucursales
    op.create_table(
        "sucursales",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(200), nullable=False, unique=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )

    # 2. Agregar sucursal_id a arqueo_records (nullable — registros históricos quedan en NULL)
    op.add_column(
        "arqueo_records",
        sa.Column("sucursal_id", sa.Integer, sa.ForeignKey("sucursales.id"), nullable=True),
    )

    # 3. Eliminar FK y columna branch_id de arqueo_records
    op.drop_constraint("arqueo_records_branch_id_fkey", "arqueo_records", type_="foreignkey")
    op.drop_column("arqueo_records", "branch_id")


def downgrade() -> None:
    op.add_column(
        "arqueo_records",
        sa.Column("branch_id", sa.Integer, nullable=True),
    )
    op.create_foreign_key(
        "arqueo_records_branch_id_fkey",
        "arqueo_records", "branches",
        ["branch_id"], ["id"],
    )
    op.drop_column("arqueo_records", "sucursal_id")
    op.drop_table("sucursales")
