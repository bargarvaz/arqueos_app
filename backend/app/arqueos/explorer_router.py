# -*- coding: utf-8 -*-
"""Router del explorador de arqueos (internos)."""

import io
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_roles, get_current_user
from app.users.models import User
from app.arqueos.explorer_service import explore_records, download_records_xlsx, get_vault_day_balances
from app.common.pagination import PaginationParams, PagedResponse, MAX_TOTAL_RECORDS

router = APIRouter(prefix="/arqueos/explorer", tags=["Explorador de Arqueos"])

_INTERNAL_ROLES = ("admin", "operations", "data_science")


@router.get(
    "/vault-balances",
    summary="Saldos apertura/cierre por bóveda para una fecha dada",
)
async def get_vault_balances_endpoint(
    target_date: date | None = Query(None, alias="date"),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    d = target_date or date.today()
    return await get_vault_day_balances(db, d)


@router.get(
    "",
    summary="Explorador de registros de arqueo con filtros avanzados",
)
async def get_explorer(
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    movement_type_id: int | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    include_counterparts: bool = Query(True),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    rows, total = await explore_records(
        db,
        company_id=company_id,
        vault_id=vault_id,
        date_from=date_from,
        date_to=date_to,
        movement_type_id=movement_type_id,
        status=status,
        search=search,
        include_counterparts=include_counterparts,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    effective_size = pagination.page_size or MAX_TOTAL_RECORDS
    return {
        "items": rows,
        "total": total,
        "page": pagination.page,
        "page_size": pagination.page_size,
        "pages": max(1, -(-total // effective_size)),
    }


@router.get(
    "/download",
    summary="Descarga XLSX del explorador con filtros aplicados",
)
async def download_explorer(
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    movement_type_id: int | None = Query(None),
    status: str | None = Query(None),
    search: str | None = Query(None),
    include_counterparts: bool = Query(True),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(*_INTERNAL_ROLES)),
):
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("User-Agent") if request else None

    xlsx_bytes = await download_records_xlsx(
        db,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        company_id=company_id,
        vault_id=vault_id,
        date_from=date_from,
        date_to=date_to,
        movement_type_id=movement_type_id,
        status=status,
        search=search,
        include_counterparts=include_counterparts,
    )

    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=arqueos_export.xlsx"},
    )
