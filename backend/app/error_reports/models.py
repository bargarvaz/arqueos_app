# -*- coding: utf-8 -*-
"""Modelos de reportes de error (Operaciones → ETV)."""

from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    Text,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class ErrorReportStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"
    closed = "closed"


class ErrorReport(Base):
    """Reporte de error enviado por Operaciones a una ETV."""

    __tablename__ = "error_reports"
    __table_args__ = (
        Index("ix_error_report_assigned", "assigned_to"),
        Index("ix_error_report_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reported_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    assigned_to: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    arqueo_header_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("arqueo_headers.id"), nullable=True
    )
    error_type_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("error_types.id"), nullable=True, index=True
    )
    status: Mapped[ErrorReportStatus] = mapped_column(
        Enum(ErrorReportStatus, name="error_report_status"), nullable=False,
        default=ErrorReportStatus.open
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    response: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
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

    record_links: Mapped[list["ErrorReportRecord"]] = relationship(
        "ErrorReportRecord", back_populates="error_report", lazy="selectin"
    )


class ErrorReportRecord(Base):
    """Registros de arqueo asociados a un reporte de error."""

    __tablename__ = "error_report_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    error_report_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("error_reports.id"), nullable=False
    )
    arqueo_record_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("arqueo_records.id"), nullable=False
    )

    error_report: Mapped["ErrorReport"] = relationship(
        "ErrorReport", back_populates="record_links"
    )
