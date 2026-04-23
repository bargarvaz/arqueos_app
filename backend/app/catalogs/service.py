# -*- coding: utf-8 -*-
"""Servicio genérico de catálogos (CRUD)."""

from datetime import date
from typing import TypeVar, Type
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_

from app.catalogs.models import MovementType, ModificationReason, Holiday
from app.common.exceptions import NotFoundError, ConflictError
from app.common.pagination import PaginationParams

CatalogModel = TypeVar("CatalogModel", MovementType, ModificationReason, Holiday)


async def list_catalog(
    db: AsyncSession,
    model: Type[CatalogModel],
    include_inactive: bool = False,
    search: str | None = None,
) -> list:
    """Lista items de cualquier catálogo."""
    query = select(model)
    if not include_inactive:
        query = query.where(model.is_active == True)
    if search:
        query = query.where(model.name.ilike(f"%{search}%"))
    query = query.order_by(model.name if hasattr(model, "name") else model.id)
    result = await db.execute(query)
    return result.scalars().all()


async def get_catalog_item(db: AsyncSession, model: Type[CatalogModel], item_id: int):
    """Obtiene un item por ID o lanza NotFoundError."""
    item = await db.get(model, item_id)
    if not item:
        raise NotFoundError(model.__name__)
    return item


async def create_movement_type(
    db: AsyncSession, name: str, description: str | None
) -> MovementType:
    result = await db.execute(
        select(MovementType).where(MovementType.name == name)
    )
    if result.scalar_one_or_none():
        raise ConflictError(f"Ya existe un tipo de movimiento llamado '{name}'.")

    item = MovementType(name=name, description=description)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_movement_type(
    db: AsyncSession, item_id: int, **kwargs
) -> MovementType:
    item = await get_catalog_item(db, MovementType, item_id)
    for key, value in kwargs.items():
        if value is not None:
            setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


async def create_modification_reason(
    db: AsyncSession, name: str
) -> ModificationReason:
    item = ModificationReason(name=name)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_modification_reason(
    db: AsyncSession, item_id: int, **kwargs
) -> ModificationReason:
    item = await get_catalog_item(db, ModificationReason, item_id)
    for key, value in kwargs.items():
        if value is not None:
            setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


async def create_holiday(
    db: AsyncSession, holiday_date: date, name: str
) -> Holiday:
    result = await db.execute(
        select(Holiday).where(Holiday.holiday_date == holiday_date)
    )
    if result.scalar_one_or_none():
        raise ConflictError(f"Ya existe un día inhábil registrado para {holiday_date}.")

    item = Holiday(holiday_date=holiday_date, name=name)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def update_holiday(db: AsyncSession, item_id: int, **kwargs) -> Holiday:
    item = await get_catalog_item(db, Holiday, item_id)
    for key, value in kwargs.items():
        if value is not None:
            setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


async def get_holidays_for_month(db: AsyncSession, year: int, month: int) -> list[date]:
    """Retorna fechas de días inhábiles activos de un mes dado."""
    from datetime import date as date_type
    from calendar import monthrange

    first = date_type(year, month, 1)
    _, last_day = monthrange(year, month)
    last = date_type(year, month, last_day)

    result = await db.execute(
        select(Holiday.holiday_date).where(
            and_(
                Holiday.is_active == True,
                Holiday.holiday_date >= first,
                Holiday.holiday_date <= last,
            )
        )
    )
    return list(result.scalars().all())


async def get_last_business_day_of_month(
    db: AsyncSession, year: int, month: int
) -> date:
    """
    Calcula el último día hábil (lunes-viernes, excluyendo holidays)
    del mes indicado. Se usa para validar el periodo de gracia.
    """
    from datetime import date as date_type, timedelta
    from calendar import monthrange

    _, last_day = monthrange(year, month)
    current = date_type(year, month, last_day)
    holidays = await get_holidays_for_month(db, year, month)

    while current.weekday() >= 5 or current in holidays:  # 5=Sat, 6=Sun
        current -= timedelta(days=1)

    return current
