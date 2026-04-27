# -*- coding: utf-8 -*-
"""Router del explorador de arqueos (todos los roles).

ETV: ve solo sus bóvedas asignadas. Otros roles: ven todas.
"""

import io
from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user
from app.users.models import User, UserVaultAssignment
from app.arqueos.explorer_service import (
    explore_records,
    download_records_xlsx,
    get_vault_day_balances,
)
from app.common.pagination import PaginationParams, PagedResponse, MAX_TOTAL_RECORDS

router = APIRouter(prefix="/arqueos/explorer", tags=["Explorador de Arqueos"])


async def _allowed_vault_ids(db: AsyncSession, user: User) -> list[int] | None:
    """
    None = sin restricción (admin/operations/data_science).
    Lista de IDs = restringido a esas bóvedas (ETV con asignaciones).
    Lista vacía = ETV sin asignaciones (no debe ver nada).
    """
    if user.role != "etv":
        return None
    result = await db.execute(
        select(UserVaultAssignment.vault_id).where(
            UserVaultAssignment.user_id == user.id,
            UserVaultAssignment.is_active == True,
        )
    )
    return [row[0] for row in result.all()]


@router.get(
    "/vault-balances",
    summary="Saldos apertura/cierre por bóveda para una fecha dada",
)
async def get_vault_balances_endpoint(
    target_date: date | None = Query(None, alias="date"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    d = target_date or date.today()
    allowed = await _allowed_vault_ids(db, current_user)
    return await get_vault_day_balances(db, d, allowed_vault_ids=allowed)


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
    current_user: User = Depends(get_current_user),
):
    allowed = await _allowed_vault_ids(db, current_user)
    if allowed is not None and not allowed:
        return {"items": [], "total": 0, "page": pagination.page,
                "page_size": pagination.page_size, "pages": 1}

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
        allowed_vault_ids=allowed,
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
    current_user: User = Depends(get_current_user),
):
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("User-Agent") if request else None

    allowed = await _allowed_vault_ids(db, current_user)
    if allowed is not None and not allowed:
        return StreamingResponse(
            io.BytesIO(b""),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=arqueos_export.xlsx"},
        )

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
        allowed_vault_ids=allowed,
    )

    return StreamingResponse(
        io.BytesIO(xlsx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=arqueos_export.xlsx"},
    )
