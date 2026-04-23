# -*- coding: utf-8 -*-
"""Modelos del módulo core de arqueos: ArqueoHeader, ArqueoRecord."""

from datetime import datetime, date
import enum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ArqueoStatus(str, enum.Enum):
    draft = "draft"
    published = "published"
    locked = "locked"


class CounterpartType(str, enum.Enum):
    cancellation = "cancellation"
    modification = "modification"


class ArqueoHeader(Base):
    """Cabecera de arqueo diario por bóveda (1 por bóveda por día)."""

    __tablename__ = "arqueo_headers"
    __table_args__ = (
        UniqueConstraint("vault_id", "arqueo_date", name="uq_vault_date"),
        Index("ix_header_vault_date", "vault_id", "arqueo_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vault_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vaults.id"), nullable=False, index=True
    )
    arqueo_date: Mapped[date] = mapped_column(Date, nullable=False)
    opening_balance: Mapped[float] = mapped_column(
        Numeric(15, 2), nullable=False, default=0
    )
    closing_balance: Mapped[float] = mapped_column(
        Numeric(15, 2), nullable=False, default=0
    )
    status: Mapped[ArqueoStatus] = mapped_column(
        Enum(ArqueoStatus, name="arqueo_status"), nullable=False, default=ArqueoStatus.draft
    )
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    locked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    records: Mapped[list["ArqueoRecord"]] = relationship(
        "ArqueoRecord",
        back_populates="header",
        lazy="selectin",
        primaryjoin="and_(ArqueoRecord.arqueo_header_id == ArqueoHeader.id, ArqueoRecord.is_active == True)",
    )


class ArqueoRecord(Base):
    """Registro individual (fila) de un arqueo diario."""

    __tablename__ = "arqueo_records"
    __table_args__ = (
        CheckConstraint(
            "(entries > 0 AND withdrawals = 0) OR "
            "(entries = 0 AND withdrawals > 0) OR "
            "(entries = 0 AND withdrawals = 0)",
            name="chk_entries_withdrawals_exclusive",
        ),
        Index("ix_record_header_id", "arqueo_header_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    record_uid: Mapped[str] = mapped_column(
        String(6), nullable=False, unique=True, index=True
    )
    arqueo_header_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("arqueo_headers.id"), nullable=False
    )
    voucher: Mapped[str] = mapped_column(String(100), nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    branch_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("branches.id"), nullable=False
    )
    entries: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    withdrawals: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    # Denominaciones — billetes
    bill_1000: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    bill_500: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    bill_200: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    bill_100: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    bill_50: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    bill_20: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    # Denominaciones — monedas
    coin_100: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_50: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_20: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_10: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_5: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_2: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_1: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_050: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_020: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)
    coin_010: Mapped[float] = mapped_column(Numeric(15, 2), nullable=False, default=0)

    movement_type_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("movement_types.id"), nullable=False
    )

    # Campos de contrapartida
    is_counterpart: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    counterpart_type: Mapped[CounterpartType | None] = mapped_column(
        Enum(CounterpartType, name="counterpart_type"), nullable=True
    )
    original_record_uid: Mapped[str | None] = mapped_column(String(6), nullable=True)

    record_date: Mapped[date] = mapped_column(Date, nullable=False)
    upload_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    header: Mapped["ArqueoHeader"] = relationship("ArqueoHeader", back_populates="records")
