# -*- coding: utf-8 -*-
"""Modelos de notificaciones in-app."""

from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class NotificationType(str, enum.Enum):
    arqueo_published = "arqueo_published"
    correction_made = "correction_made"
    missing_arqueo = "missing_arqueo"
    weekend_upload = "weekend_upload"
    negative_balance = "negative_balance"
    excess_certificates = "excess_certificates"
    vault_reactivated = "vault_reactivated"
    password_reset = "password_reset"
    error_reported = "error_reported"
    error_response = "error_response"
    general = "general"


class Notification(Base):
    """Notificación in-app para un usuario."""

    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notif_recipient", "recipient_id"),
        Index("ix_notif_recipient_unread", "recipient_id", "is_read"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    recipient_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False
    )
    sender_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True
    )
    notification_type: Mapped[NotificationType] = mapped_column(
        Enum(NotificationType, name="notification_type"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
