# -*- coding: utf-8 -*-
"""Router de catálogos administrables."""

from fastapi import APIRouter, Depends, Query, status

from app.catalogs import service as catalog_service
from app.catalogs.models import MovementType, ModificationReason, Holiday
from app.catalogs.schemas import (
    MovementTypeCreate, MovementTypeUpdate, MovementTypeResponse,
    ModificationReasonCreate, ModificationReasonUpdate, ModificationReasonResponse,
    HolidayCreate, HolidayUpdate, HolidayResponse,
)
from app.dependencies import require_admin, get_current_user, DbSession

router = APIRouter(prefix="/catalogs", tags=["Catálogos"])

AdminUser = Depends(require_admin())


# ─── Tipos de movimiento ─────────────────────────────────────────────────────

@router.get("/movement-types", response_model=list[MovementTypeResponse])
async def list_movement_types(
    db: DbSession,
    _=Depends(get_current_user),
    include_inactive: bool = Query(default=False),
    search: str | None = Query(default=None),
):
    return await catalog_service.list_catalog(db, MovementType, include_inactive, search)


@router.post(
    "/movement-types", response_model=MovementTypeResponse, status_code=status.HTTP_201_CREATED
)
async def create_movement_type(body: MovementTypeCreate, db: DbSession, admin=AdminUser):
    return await catalog_service.create_movement_type(db, body.name, body.description)


@router.patch("/movement-types/{item_id}", response_model=MovementTypeResponse)
async def update_movement_type(
    item_id: int, body: MovementTypeUpdate, db: DbSession, admin=AdminUser
):
    return await catalog_service.update_movement_type(
        db, item_id, name=body.name, description=body.description, is_active=body.is_active
    )


# ─── Motivos de modificación ─────────────────────────────────────────────────

@router.get("/modification-reasons", response_model=list[ModificationReasonResponse])
async def list_modification_reasons(
    db: DbSession,
    _=Depends(get_current_user),
    include_inactive: bool = Query(default=False),
):
    return await catalog_service.list_catalog(db, ModificationReason, include_inactive)


@router.post(
    "/modification-reasons",
    response_model=ModificationReasonResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_modification_reason(
    body: ModificationReasonCreate, db: DbSession, admin=AdminUser
):
    return await catalog_service.create_modification_reason(db, body.name)


@router.patch("/modification-reasons/{item_id}", response_model=ModificationReasonResponse)
async def update_modification_reason(
    item_id: int, body: ModificationReasonUpdate, db: DbSession, admin=AdminUser
):
    return await catalog_service.update_modification_reason(
        db, item_id, name=body.name, is_active=body.is_active
    )


# ─── Días inhábiles ───────────────────────────────────────────────────────────

@router.get("/holidays", response_model=list[HolidayResponse])
async def list_holidays(
    db: DbSession,
    _=Depends(get_current_user),
    include_inactive: bool = Query(default=False),
):
    return await catalog_service.list_catalog(db, Holiday, include_inactive)


@router.post(
    "/holidays", response_model=HolidayResponse, status_code=status.HTTP_201_CREATED
)
async def create_holiday(body: HolidayCreate, db: DbSession, admin=AdminUser):
    return await catalog_service.create_holiday(db, body.holiday_date, body.name)


@router.patch("/holidays/{item_id}", response_model=HolidayResponse)
async def update_holiday(
    item_id: int, body: HolidayUpdate, db: DbSession, admin=AdminUser
):
    return await catalog_service.update_holiday(
        db, item_id, name=body.name, is_active=body.is_active
    )
