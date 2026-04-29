# -*- coding: utf-8 -*-
"""Router del módulo de arqueos — captura, publicación y consulta."""

from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_roles
from app.users.models import User
from app.arqueos.schemas import (
    ArqueoHeaderCreate,
    ArqueoHeaderResponse,
    ArqueoHeaderWithRecordsResponse,
    MonthlyClosingsResponse,
    PublishArqueoRequest,
)
from app.arqueos import service
from app.common.pagination import PaginationParams, PagedResponse
from app.common.exceptions import ForbiddenError

router = APIRouter(prefix="/arqueos", tags=["Arqueos"])


# ─── ETV: bóvedas asignadas ───────────────────────────────────────────────────

@router.get(
    "/my-vaults",
    summary="Bóvedas asignadas al ETV autenticado",
)
async def get_my_vaults(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    """Retorna las bóvedas activas asignadas al ETV con el estado del arqueo de hoy."""
    return await service.get_etv_vaults(db, user_id=current_user.id)


# ─── Saldos finales (cierres por mes) ─────────────────────────────────────────

@router.get(
    "/closings/{vault_id}",
    response_model=MonthlyClosingsResponse,
    summary="Saldos finales mensuales por bóveda (cierre por día y denominación)",
)
async def get_monthly_closings(
    vault_id: int,
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cualquier rol autenticado puede consultar. ETV únicamente sus bóvedas
    asignadas (verificación explícita).
    """
    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, vault_id)

    return await service.get_monthly_closings(db, vault_id, year, month)


# ─── Header ───────────────────────────────────────────────────────────────────

@router.post(
    "/headers",
    response_model=ArqueoHeaderResponse,
    status_code=200,
    summary="Obtener o crear el header de arqueo para un día/bóveda",
)
async def get_or_create_arqueo_header(
    body: ArqueoHeaderCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    """
    Idempotente: crea el header si no existe, o devuelve el existente.
    Solo ETVs con la bóveda asignada pueden acceder.
    """
    from app.arqueos.service import _verify_vault_assignment
    await _verify_vault_assignment(db, current_user.id, body.vault_id)
    header = await service.get_or_create_header(
        db, body.vault_id, body.arqueo_date, current_user.id
    )
    await db.commit()
    await db.refresh(header)
    return header


@router.get(
    "/my-history",
    response_model=PagedResponse[ArqueoHeaderResponse],
    summary="Historial de arqueos del ETV autenticado",
)
async def list_my_arqueo_history(
    vault_id: int | None = Query(None),
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    """Retorna todos los arqueos de las bóvedas asignadas al ETV, paginados."""
    from sqlalchemy import select
    from app.users.models import UserVaultAssignment
    from app.vaults.models import Vault
    assigned_q = select(UserVaultAssignment.vault_id).where(
        UserVaultAssignment.user_id == current_user.id,
        UserVaultAssignment.is_active == True,
    )
    result = await db.execute(assigned_q)
    all_vault_ids = [row[0] for row in result.fetchall()]
    vault_ids = [vault_id] if (vault_id and vault_id in all_vault_ids) else all_vault_ids

    headers, total = await service.list_headers(
        db,
        vault_ids=vault_ids,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=pagination.page,
        page_size=pagination.page_size,
    )

    # Enriquecer con vault_code y vault_name para la navegación del frontend
    vault_result = await db.execute(
        select(Vault).where(Vault.id.in_(all_vault_ids))
    )
    vault_map = {v.id: v for v in vault_result.scalars().all()}

    enriched = []
    for h in headers:
        vault = vault_map.get(h.vault_id)
        item = ArqueoHeaderResponse.model_validate(h)
        item.vault_code = vault.vault_code if vault else None
        item.vault_name = vault.vault_name if vault else None
        enriched.append(item)

    return PagedResponse.build(enriched, total, pagination)


@router.get(
    "/headers",
    response_model=PagedResponse[ArqueoHeaderResponse],
    summary="Listar headers de arqueo (usuarios internos)",
)
async def list_arqueo_headers(
    vault_id: int | None = Query(None),
    status: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "operations", "data_science")),
):
    headers, total = await service.list_headers(
        db,
        vault_id=vault_id,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    return PagedResponse.build(headers, total, pagination)


@router.get(
    "/headers/{header_id}",
    response_model=ArqueoHeaderWithRecordsResponse,
    summary="Detalle de un header con sus registros activos",
)
async def get_arqueo_header(
    header_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    ETVs solo pueden consultar headers de sus bóvedas asignadas.
    Usuarios internos pueden consultar cualquier header.
    """
    header = await service.get_header(db, header_id)

    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    # Enriquecer con vault_code/vault_name para la UI
    from app.vaults.models import Vault
    response = ArqueoHeaderWithRecordsResponse.model_validate(header)
    vault = await db.get(Vault, header.vault_id)
    if vault:
        response.vault_code = vault.vault_code
        response.vault_name = vault.vault_name
    return response


# ─── Publicación ──────────────────────────────────────────────────────────────

@router.post(
    "/{vault_id}/{arqueo_date}/publish",
    response_model=ArqueoHeaderWithRecordsResponse,
    status_code=200,
    summary="Publicar el arqueo del día",
)
async def publish_arqueo(
    vault_id: int,
    arqueo_date: date,
    body: PublishArqueoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    """
    Publica el arqueo del día para la bóveda indicada.
    Incluye validaciones, optimistic locking y disparo de cascada.
    """
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    records_data: list[dict[str, Any]] = [
        r.model_dump() for r in body.records
    ]

    header = await service.publish_arqueo(
        db=db,
        vault_id=vault_id,
        arqueo_date=arqueo_date,
        records_data=records_data,
        user_id=current_user.id,
        expected_updated_at=body.updated_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return header
