# -*- coding: utf-8 -*-
"""015 - Reset del saldo de bóveda + tipo de notificación.

Agrega `vaults.balance_reset_at` (DATE NULL) para marcar la fecha en que
el admin reescribió las denominaciones iniciales como nuevo saldo de inicio.
A partir de esa fecha (exclusiva), los cálculos de apertura/inventario
solo consideran arqueos posteriores.

Agrega `vault_balance_reset` al enum `notification_type`.

Revision ID: 015
Revises: 014
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vaults",
        sa.Column("balance_reset_at", sa.Date(), nullable=True),
    )

    # PostgreSQL: añadir nuevo valor al enum existente.
    op.execute(
        "ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'vault_balance_reset'"
    )


def downgrade() -> None:
    op.drop_column("vaults", "balance_reset_at")
    # Nota: PostgreSQL no permite eliminar valores de un enum sin recrearlo.
    # Se omite el rollback del enum (no es destructivo dejar el valor extra).
