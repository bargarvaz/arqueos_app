# -*- coding: utf-8 -*-
"""Router de notificaciones in-app."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.users.models import User
from app.notifications.schemas import NotificationResponse
from app.notifications import service
from app.common.pagination import PaginationParams, PagedResponse

router = APIRouter(prefix="/notifications", tags=["Notificaciones"])


@router.get(
    "/unread-count",
    summary="Contador de notificaciones no leídas",
)
async def get_unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = await service.get_unread_count(db, current_user.id)
    return {"unread_count": count}


@router.get(
    "",
    response_model=PagedResponse[NotificationResponse],
    summary="Listar notificaciones del usuario",
)
async def list_notifications(
    unread_only: bool = Query(False),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notifications, total = await service.list_notifications(
        db,
        user_id=current_user.id,
        page=pagination.page,
        page_size=pagination.page_size,
        unread_only=unread_only,
    )
    return PagedResponse.build(notifications, total, pagination)


@router.put(
    "/{notification_id}/read",
    status_code=204,
    summary="Marcar notificación como leída",
)
async def mark_as_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await service.mark_as_read(db, notification_id, current_user.id)


@router.put(
    "/mark-all-read",
    status_code=204,
    summary="Marcar todas las notificaciones como leídas",
)
async def mark_all_as_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await service.mark_all_as_read(db, current_user.id)


@router.delete(
    "/{notification_id}",
    status_code=204,
    summary="Eliminar una notificación propia",
)
async def delete_notification(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.common.exceptions import NotFoundError
    ok = await service.delete_notification(db, notification_id, current_user.id)
    if not ok:
        raise NotFoundError("Notificación")


@router.delete(
    "",
    summary="Eliminar todas las notificaciones del usuario",
)
async def delete_all_notifications(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = await service.delete_all_notifications(db, current_user.id)
    return {"deleted": deleted}
