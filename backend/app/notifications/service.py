# -*- coding: utf-8 -*-
"""
Servicio de notificaciones in-app.
Centraliza la creación de notificaciones para todos los módulos.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func

from app.notifications.models import Notification, NotificationType
from app.users.models import User, UserRole

logger = logging.getLogger(__name__)


async def create_notification(
    db: AsyncSession,
    recipient_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    sender_id: int | None = None,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> Notification:
    """Crea una notificación para un usuario."""
    notif = Notification(
        recipient_id=recipient_id,
        sender_id=sender_id,
        notification_type=notification_type,
        title=title,
        message=message,
        entity_type=entity_type,
        entity_id=entity_id,
    )
    db.add(notif)
    await db.flush()
    return notif


async def _get_users_by_roles(db: AsyncSession, roles: list[UserRole]) -> list[User]:
    """Retorna todos los usuarios activos con alguno de los roles indicados."""
    result = await db.execute(
        select(User).where(
            User.role.in_(roles),
            User.is_active == True,
        )
    )
    return list(result.scalars().all())


async def notify_operations_and_admin(
    db: AsyncSession,
    notification_type: NotificationType,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
    sender_id: int | None = None,
) -> None:
    """Notifica a todos los usuarios Operations y Admin activos."""
    users = await _get_users_by_roles(
        db, [UserRole.operations, UserRole.admin]
    )
    for user in users:
        await create_notification(
            db,
            recipient_id=user.id,
            notification_type=notification_type,
            title=title,
            message=message,
            sender_id=sender_id,
            entity_type=entity_type,
            entity_id=entity_id,
        )


# ─── Notificaciones de negocio ────────────────────────────────────────────────

async def notify_arqueo_published(
    db: AsyncSession,
    vault_code: str,
    arqueo_date,
    header_id: int,
    published_by: int,
) -> None:
    await notify_operations_and_admin(
        db,
        notification_type=NotificationType.arqueo_published,
        title=f"Arqueo publicado — {vault_code}",
        message=f"Se publicó el arqueo de la bóveda {vault_code} para el {arqueo_date}.",
        entity_type="arqueo_header",
        entity_id=header_id,
        sender_id=published_by,
    )


async def notify_negative_balance(
    db: AsyncSession,
    vault_code: str,
    arqueo_date,
    closing_balance,
    header_id: int,
    published_by: int,
) -> None:
    await notify_operations_and_admin(
        db,
        notification_type=NotificationType.negative_balance,
        title=f"Saldo negativo — {vault_code}",
        message=(
            f"La bóveda {vault_code} tiene saldo de cierre negativo "
            f"(${closing_balance}) al {arqueo_date}."
        ),
        entity_type="arqueo_header",
        entity_id=header_id,
        sender_id=published_by,
    )


async def notify_weekend_upload(
    db: AsyncSession,
    vault_code: str,
    arqueo_date,
    header_id: int,
    published_by: int,
) -> None:
    await notify_operations_and_admin(
        db,
        notification_type=NotificationType.weekend_upload,
        title=f"Carga en día inhábil — {vault_code}",
        message=(
            f"La bóveda {vault_code} registró un arqueo en día inhábil ({arqueo_date})."
        ),
        entity_type="arqueo_header",
        entity_id=header_id,
        sender_id=published_by,
    )


async def notify_vault_reactivated(
    db: AsyncSession,
    vault_code: str,
    vault_id: int,
    reactivated_by: int,
) -> None:
    await notify_operations_and_admin(
        db,
        notification_type=NotificationType.vault_reactivated,
        title=f"Bóveda reactivada — {vault_code}",
        message=f"La bóveda {vault_code} fue reactivada por el administrador.",
        entity_type="vault",
        entity_id=vault_id,
        sender_id=reactivated_by,
    )


async def notify_password_reset(
    db: AsyncSession,
    recipient_id: int,
) -> None:
    await create_notification(
        db,
        recipient_id=recipient_id,
        notification_type=NotificationType.password_reset,
        title="Contraseña restablecida",
        message=(
            "Tu contraseña fue restablecida por el administrador. "
            "Usa la contraseña temporal que te fue entregada para iniciar sesión."
        ),
    )


async def notify_missing_arqueo(
    db: AsyncSession,
    vault_code: str,
    vault_id: int,
    target_date,
) -> None:
    """Notifica a Operations y Admin por una bóveda sin arqueo."""
    await notify_operations_and_admin(
        db,
        notification_type=NotificationType.missing_arqueo,
        title=f"Arqueo faltante — {vault_code}",
        message=f"La bóveda {vault_code} no ha subido el arqueo del {target_date}.",
        entity_type="vault",
        entity_id=vault_id,
    )


# ─── Consultas ────────────────────────────────────────────────────────────────

async def list_notifications(
    db: AsyncSession,
    user_id: int,
    page: int = 1,
    page_size: int = 25,
    unread_only: bool = False,
) -> tuple[list[Notification], int]:
    query = select(Notification).where(Notification.recipient_id == user_id)
    if unread_only:
        query = query.where(Notification.is_read == False)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Notification.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_unread_count(db: AsyncSession, user_id: int) -> int:
    result = await db.execute(
        select(func.count(Notification.id)).where(
            Notification.recipient_id == user_id,
            Notification.is_read == False,
        )
    )
    return result.scalar_one()


async def mark_as_read(
    db: AsyncSession, notification_id: int, user_id: int
) -> None:
    await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id,
            Notification.recipient_id == user_id,
        )
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def mark_all_as_read(db: AsyncSession, user_id: int) -> None:
    await db.execute(
        update(Notification)
        .where(
            Notification.recipient_id == user_id,
            Notification.is_read == False,
        )
        .values(is_read=True, read_at=datetime.now(timezone.utc))
    )
    await db.commit()
