# -*- coding: utf-8 -*-
"""Cambia manager_id y treasurer_id en vaults para referenciar users en lugar de personnel.

Revision ID: 009
Revises: 008
Create Date: 2026-04-23
"""

from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Limpiar asignaciones actuales (apuntaban a personnel, IDs incompatibles con users)
    op.execute("UPDATE vaults SET manager_id = NULL, treasurer_id = NULL")

    # Eliminar FKs hacia personnel
    op.drop_constraint("vaults_manager_id_fkey", "vaults", type_="foreignkey")
    op.drop_constraint("vaults_treasurer_id_fkey", "vaults", type_="foreignkey")

    # Crear nuevas FKs hacia users
    op.create_foreign_key(
        "vaults_manager_id_fkey", "vaults", "users", ["manager_id"], ["id"]
    )
    op.create_foreign_key(
        "vaults_treasurer_id_fkey", "vaults", "users", ["treasurer_id"], ["id"]
    )


def downgrade() -> None:
    op.execute("UPDATE vaults SET manager_id = NULL, treasurer_id = NULL")
    op.drop_constraint("vaults_manager_id_fkey", "vaults", type_="foreignkey")
    op.drop_constraint("vaults_treasurer_id_fkey", "vaults", type_="foreignkey")
    op.create_foreign_key(
        "vaults_manager_id_fkey", "vaults", "personnel", ["manager_id"], ["id"]
    )
    op.create_foreign_key(
        "vaults_treasurer_id_fkey", "vaults", "personnel", ["treasurer_id"], ["id"]
    )
