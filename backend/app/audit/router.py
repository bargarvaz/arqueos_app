# -*- coding: utf-8 -*-
"""Router del audit log (solo Admin)."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from pydantic import BaseModel
from typing import Any
from datetime import datetime

from app.dependencies import get_db, require_roles
from app.audit.models import AuditLog
from app.common.pagination import PaginationParams, PagedResponse

router = APIRouter(prefix="/audit-log", tags=["Auditoría"])


class AuditLogResponse(BaseModel):
    id: int
    user_id: int | None
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
    query = select(AuditLog)
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

    if conditions:
        query = query.where(and_(*conditions))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    offset = (pagination.page - 1) * pagination.page_size
    query = query.order_by(AuditLog.created_at.desc()).offset(offset).limit(pagination.page_size)

    result = await db.execute(query)
    entries = list(result.scalars().all())

    return PagedResponse.build(entries, total, pagination)
