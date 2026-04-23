# -*- coding: utf-8 -*-
"""Router de reportes descargables."""

from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
import io

from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_roles, get_current_user
from app.users.models import User
from app.reports import service
from app.common.pagination import PaginationParams, PagedResponse

router = APIRouter(prefix="/reports", tags=["Reportes"])

_INTERNAL_ROLES = ("admin", "operations", "data_science")


@router.get(
    "/daily-balances",
    summary="Reporte de saldos finales por bóveda/día",
)
async def get_daily_balances(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    rows, total = await service.get_daily_balances(
        db,
        date_from=date_from,
        date_to=date_to,
        company_id=company_id,
        vault_id=vault_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    return {
        "items": rows,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // pagination.page_size)),
    }


@router.get(
    "/daily-balances/download",
    summary="Descarga XLSX de saldos diarios",
)
async def download_daily_balances(
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_INTERNAL_ROLES)),
):
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("User-Agent") if request else None

    xlsx_bytes = await service.download_daily_balances_xlsx(
        db,
        date_from=date_from,
        date_to=date_to,
        company_id=company_id,
        vault_id=vault_id,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    filename = f"saldos_{date_from or 'inicio'}_{date_to or 'hoy'}.xlsx"
    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
