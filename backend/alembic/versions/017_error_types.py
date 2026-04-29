# -*- coding: utf-8 -*-
"""017 - Catálogo de tipos de error + FK en error_reports.

Crea la tabla `error_types` (admin la administra) y una columna nueva
`error_reports.error_type_id` (nullable) para clasificar cada reporte por
tipo. Existing reports se quedan con error_type_id NULL.

Revision ID: 017
Revises: 016
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


_DEFAULT_TYPES = [
    ("Captura incorrecta", "El registro tiene datos mal capturados."),
    ("Comprobante faltante", "Falta el comprobante o referencia documental."),
    ("Monto erróneo", "Las entradas o salidas no coinciden con el monto físico."),
    ("Denominación incorrecta", "El desglose por denominación no cuadra."),
    ("Bóveda incorrecta", "El registro fue cargado en la bóveda equivocada."),
    ("Otro", "Otro tipo de error no listado."),
]


def upgrade() -> None:
    op.create_table(
        "error_types",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", name="uq_error_types_name"),
    )

    # Seed con tipos básicos para que el catálogo sea utilizable de inmediato.
    error_types_table = sa.table(
        "error_types",
        sa.column("name", sa.String),
        sa.column("description", sa.Text),
    )
    op.bulk_insert(
        error_types_table,
        [{"name": n, "description": d} for n, d in _DEFAULT_TYPES],
    )

    op.add_column(
        "error_reports",
        sa.Column("error_type_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_error_reports_error_type",
        "error_reports",
        "error_types",
        ["error_type_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_error_reports_error_type",
        "error_reports",
        ["error_type_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_error_reports_error_type", table_name="error_reports")
    op.drop_constraint(
        "fk_error_reports_error_type", "error_reports", type_="foreignkey"
    )
    op.drop_column("error_reports", "error_type_id")
    op.drop_table("error_types")
