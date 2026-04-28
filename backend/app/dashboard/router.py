# -*- coding: utf-8 -*-
"""Router del dashboard operativo."""

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_roles
from app.dashboard import service

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

_INTERNAL_ROLES = ("admin", "operations", "data_science")


@router.get(
    "/summary",
    summary="Métricas en el rango (bóvedas, montos, faltantes)",
)
async def get_summary(
    target_date: date | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_summary(
        db,
        target_date=target_date,
        date_from=date_from,
        date_to=date_to,
        company_id=company_id,
        vault_id=vault_id,
    )


@router.get(
    "/missing-vaults",
    summary="Bóvedas sin arqueo en el rango",
)
async def get_missing_vaults(
    target_date: date | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_missing_vaults(
        db,
        target_date=target_date,
        date_from=date_from,
        date_to=date_to,
        company_id=company_id,
        vault_id=vault_id,
    )


@router.get(
    "/weekly-trend",
    summary="Tendencia de los últimos 7 días",
)
async def get_weekly_trend(
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    end_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_weekly_trend(
        db, company_id=company_id, vault_id=vault_id, end_date=end_date,
    )


@router.get(
    "/denomination-distribution",
    summary="Distribución por denominación al cierre del rango",
)
async def get_denomination_distribution(
    target_date: date | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    company_id: int | None = Query(None),
    vault_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_denomination_distribution(
        db,
        target_date=target_date,
        date_from=date_from,
        date_to=date_to,
        company_id=company_id,
        vault_id=vault_id,
    )
