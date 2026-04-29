# -*- coding: utf-8 -*-
"""016 - Eliminar tabla y enum legacy `personnel`.

El modelo `Personnel` fue reemplazado en la migración 009 por usuarios con
sub-rol (gerente / tesorero). Las FK `vaults.manager_id` y
`vaults.treasurer_id` apuntan ya a `users.id` desde entonces, así que la
tabla quedó huérfana sin consumidores en código ni en API.

Esta migración elimina la tabla `personnel` y su enum `personnel_type`.

Revision ID: 016
Revises: 015
Create Date: 2026-04-29
"""
from alembic import op
import sqlalchemy as sa


revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table("personnel")
    sa.Enum(name="personnel_type").drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    personnel_type = sa.Enum("manager", "treasurer", name="personnel_type")
    personnel_type.create(op.get_bind(), checkfirst=True)
    op.create_table(
        "personnel",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("full_name", sa.String(length=200), nullable=False),
        sa.Column("position", sa.String(length=100), nullable=False),
        sa.Column("personnel_type", personnel_type, nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
