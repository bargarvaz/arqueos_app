# -*- coding: utf-8 -*-
"""Modelos: Vault, Branch."""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Branch(Base):
    """Sucursales."""

    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Vault(Base):
    """Bóvedas bancarias."""

    __tablename__ = "vaults"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vault_code: Mapped[str] = mapped_column(
        String(20), nullable=False, unique=True, index=True
    )
    vault_name: Mapped[str] = mapped_column(String(150), nullable=False)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id"), nullable=False
    )
    empresa_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("empresas.id"), nullable=True
    )
    branch_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("branches.id"), nullable=False
    )
    manager_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    treasurer_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    initial_balance: Mapped[float] = mapped_column(
        Numeric(15, 2), nullable=False, default=0
    )
    # Denominaciones del saldo inicial (suma debe igualar initial_balance)
    initial_bill_1000: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_bill_500: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_bill_200: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_bill_100: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_bill_50: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_bill_20: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_100: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_50: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_20: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_10: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_5: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_2: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_1: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_050: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_020: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    initial_coin_010: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reactivated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Fecha del último reset de saldo (admin reescribió denominaciones iniciales).
    # A partir de esta fecha (exclusiva) los cálculos de apertura e inventario
    # ignoran cualquier arqueo anterior.
    balance_reset_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    branch: Mapped["Branch"] = relationship("Branch", lazy="joined")
