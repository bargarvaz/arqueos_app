# -*- coding: utf-8 -*-
"""Router del audit log (solo Admin)."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel

from app.dependencies import get_db, require_roles
from app.audit.models import AuditLog
from app.users.models import User
from app.common.pagination import PaginationParams, PagedResponse

router = APIRouter(prefix="/audit-log", tags=["Auditoría"])


class AuditLogResponse(BaseModel):
    id: int
    user_id: int | None
    user_email: str | None
    user_name: str | None
    action: str
    entity_type: str
    entity_id: int | None
    old_values: dict | None
    new_values: dict | None
    ip_address: str | None
    user_agent: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


@router.get(
    "",
    response_model=PagedResponse[AuditLogResponse],
    summary="Listar audit log (Admin)",
)
async def list_audit_log(
    user_id: int | None = Query(None),
    action: str | None = Query(None),
    entity_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles("admin")),
):
    conditions = []
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)
    if entity_type:
        conditions.append(AuditLog.entity_type == entity_type)
    if date_from:
        conditions.append(AuditLog.created_at >= date_from)
    if date_to:
        conditions.append(AuditLog.created_at <= date_to)

    count_q = select(func.count()).select_from(
        select(AuditLog).where(and_(*conditions)).subquery() if conditions
        else select(AuditLog).subquery()
    )
    total = (await db.execute(count_q)).scalar_one()

    offset = (pagination.page - 1) * pagination.page_size
    rows_q = (
        select(
            AuditLog,
            User.email.label("user_email"),
            User.full_name.label("user_name"),
        )
        .outerjoin(User, AuditLog.user_id == User.id)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(pagination.page_size)
    )
    if conditions:
        rows_q = rows_q.where(and_(*conditions))

    result = await db.execute(rows_q)
    rows = result.all()

    entries = []
    for row in rows:
        log = row[0]
        entries.append(
            AuditLogResponse(
                id=log.id,
                user_id=log.user_id,
                user_email=row.user_email,
                user_name=row.user_name,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                old_values=log.old_values,
                new_values=log.new_values,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                created_at=log.created_at,
            )
        )

    return PagedResponse.build(entries, total, pagination)
