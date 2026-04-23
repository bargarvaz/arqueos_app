# -*- coding: utf-8 -*-
"""Modelo de log de modificaciones a arqueos."""

from datetime import datetime
import enum

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ModificationType(str, enum.Enum):
    add = "add"
    edit = "edit"
    delete = "delete"


class ArqueoModification(Base):
    """
    Log inmutable de modificaciones a registros de arqueo.
    Se crea una entrada por cada operación: add / edit / delete.
    """

    __tablename__ = "arqueo_modifications"
    __table_args__ = (
        Index("ix_mod_record_id", "arqueo_record_id"),
        Index("ix_mod_header_id", "arqueo_header_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    arqueo_header_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("arqueo_headers.id"), nullable=False
    )
    arqueo_record_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("arqueo_records.id"), nullable=True
    )
    modification_type: Mapped[ModificationType] = mapped_column(
        Enum(ModificationType, name="modification_type"), nullable=False
    )
    reason_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("modification_reasons.id"), nullable=False
    )
    reason_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    previous_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    new_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
