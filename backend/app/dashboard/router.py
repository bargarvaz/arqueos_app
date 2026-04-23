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
    summary="Métricas del día (bóvedas, montos, faltantes)",
)
async def get_summary(
    target_date: date | None = Query(None),
    company_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_summary(db, target_date=target_date, company_id=company_id)


@router.get(
    "/missing-vaults",
    summary="Bóvedas sin arqueo hoy",
)
async def get_missing_vaults(
    target_date: date | None = Query(None),
    company_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_missing_vaults(
        db, target_date=target_date, company_id=company_id
    )


@router.get(
    "/weekly-trend",
    summary="Tendencia de los últimos 7 días",
)
async def get_weekly_trend(
    company_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_weekly_trend(db, company_id=company_id)


@router.get(
    "/denomination-distribution",
    summary="Distribución por denominación del día",
)
async def get_denomination_distribution(
    target_date: date | None = Query(None),
    company_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_roles(*_INTERNAL_ROLES)),
):
    return await service.get_denomination_distribution(
        db, target_date=target_date, company_id=company_id
    )
