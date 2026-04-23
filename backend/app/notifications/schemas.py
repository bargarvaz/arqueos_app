# -*- coding: utf-8 -*-
"""Schemas de notificaciones."""

from datetime import datetime
from pydantic import BaseModel
from app.notifications.models import NotificationType


class NotificationResponse(BaseModel):
    id: int
    recipient_id: int
    sender_id: int | None
    notification_type: NotificationType
    title: str
    message: str
    entity_type: str | None
    entity_id: int | None
    is_read: bool
    read_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}
