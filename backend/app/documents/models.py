# -*- coding: utf-8 -*-
"""Modelo de certificados PDF almacenados en MinIO."""

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Certificate(Base):
    """Referencia a un certificado PDF subido para un arqueo."""

    __tablename__ = "certificates"
    __table_args__ = (
        Index("ix_cert_header_id", "arqueo_header_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    arqueo_header_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("arqueo_headers.id"), nullable=False
    )
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    minio_bucket: Mapped[str] = mapped_column(String(100), nullable=False)
    minio_key: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    content_type: Mapped[str] = mapped_column(
        String(100), nullable=False, default="application/pdf"
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    uploaded_by: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
