# -*- coding: utf-8 -*-
"""Servicio de bóvedas, sucursales y personal."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

import asyncio

from app.vaults.models import Vault, Branch, Personnel
from app.audit.service import log_action
from app.common.exceptions import NotFoundError, ConflictError
from app.common.pagination import PaginationParams


# ─── Branch ───────────────────────────────────────────────────────────────────

async def create_branch(db: AsyncSession, name: str) -> Branch:
    branch = Branch(name=name)
    db.add(branch)
    await db.commit()
    await db.refresh(branch)
    return branch


async def list_branches(
    db: AsyncSession, include_inactive: bool = False, search: str | None = None
) -> list[Branch]:
    query = select(Branch)
    if not include_inactive:
        query = query.where(Branch.is_active == True)
    if search:
        query = query.where(Branch.name.ilike(f"%{search}%"))
    result = await db.execute(query.order_by(Branch.name))
    return list(result.scalars().all())


async def update_branch(db: AsyncSession, branch_id: int, **kwargs) -> Branch:
    branch = await db.get(Branch, branch_id)
    if not branch:
        raise NotFoundError("Sucursal")
    for k, v in kwargs.items():
        if v is not None:
            setattr(branch, k, v)
    await db.commit()
    await db.refresh(branch)
    return branch


# ─── Personnel ────────────────────────────────────────────────────────────────

async def create_personnel(
    db: AsyncSession, full_name: str, position: str, personnel_type: str
) -> Personnel:
    p = Personnel(full_name=full_name, position=position, personnel_type=personnel_type)
    db.add(p)
    await db.commit()
    await db.refresh(p)
    return p


async def list_personnel(
    db: AsyncSession,
    personnel_type: str | None = None,
    include_inactive: bool = False,
    search: str | None = None,
) -> list[Personnel]:
    query = select(Personnel)
    conditions = []
    if not include_inactive:
        conditions.append(Personnel.is_active == True)
    if personnel_type:
        conditions.append(Personnel.personnel_type == personnel_type)
    if search:
        conditions.append(Personnel.full_name.ilike(f"%{search}%"))
    if conditions:
        query = query.where(and_(*conditions))
    result = await db.execute(query.order_by(Personnel.full_name))
    return list(result.scalars().all())


async def update_personnel(db: AsyncSession, person_id: int, **kwargs) -> Personnel:
    p = await db.get(Personnel, person_id)
    if not p:
        raise NotFoundError("Personal")
    for k, v in kwargs.items():
        if v is not None:
            setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


# ─── Vault ────────────────────────────────────────────────────────────────────

async def _get_or_create_branch(db: AsyncSession, name: str) -> Branch:
    """Busca o crea una Branch con el nombre dado."""
    result = await db.execute(select(Branch).where(Branch.name == name))
    branch = result.scalar_one_or_none()
    if not branch:
        branch = Branch(name=name)
        db.add(branch)
        await db.flush()
    return branch


async def create_vault(
    db: AsyncSession,
    *,
    vault_code: str,
    vault_name: str,
    company_id: int,
    empresa_id: int | None,
    manager_id: int | None,
    treasurer_id: int | None,
    initial_balance: Decimal,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    # Verificar código único
    result = await db.execute(select(Vault).where(Vault.vault_code == vault_code))
    if result.scalar_one_or_none():
        raise ConflictError(f"Ya existe una bóveda con el código '{vault_code}'.")

    # Branch se resuelve automáticamente desde vault_code
    branch = await _get_or_create_branch(db, vault_code)

    vault = Vault(
        vault_code=vault_code,
        vault_name=vault_name,
        company_id=company_id,
        empresa_id=empresa_id,
        branch_id=branch.id,
        manager_id=manager_id,
        treasurer_id=treasurer_id,
        initial_balance=initial_balance,
        is_active=True,
    )
    db.add(vault)
    await db.flush()

    await log_action(
        db,
        user_id=admin_user_id,
        action="create",
        entity_type="vault",
        entity_id=vault.id,
        new_values={
            "vault_code": vault_code,
            "vault_name": vault_name,
            "initial_balance": str(initial_balance),
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)
    return vault


async def get_vault(db: AsyncSession, vault_id: int) -> Vault:
    vault = await db.get(Vault, vault_id)
    if not vault:
        raise NotFoundError("Bóveda")
    return vault


async def list_vaults(
    db: AsyncSession,
    params: PaginationParams,
    include_inactive: bool = False,
    company_id: int | None = None,
    search: str | None = None,
) -> tuple[list[Vault], int]:
    query = select(Vault)
    conditions = []

    if not include_inactive:
        conditions.append(Vault.is_active == True)
    if company_id:
        conditions.append(Vault.company_id == company_id)
    if search:
        conditions.append(
            or_(Vault.vault_code.ilike(f"%{search}%"), Vault.vault_name.ilike(f"%{search}%"))
        )

    if conditions:
        query = query.where(and_(*conditions))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    query = query.order_by(Vault.vault_code).offset(params.offset).limit(params.limit)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def get_current_balances(
    db: AsyncSession, vault_ids: list[int]
) -> dict[int, Decimal]:
    """
    Devuelve el último closing_balance publicado por bóveda. Si una bóveda no tiene
    ningún arqueo publicado, no aparece en el dict (el caller usa initial_balance).
    """
    if not vault_ids:
        return {}

    from app.arqueos.models import ArqueoHeader, ArqueoStatus

    # Subconsulta: fecha máxima de header publicado por bóveda
    subq = (
        select(
            ArqueoHeader.vault_id,
            func.max(ArqueoHeader.arqueo_date).label("last_date"),
        )
        .where(
            ArqueoHeader.vault_id.in_(vault_ids),
            ArqueoHeader.status != ArqueoStatus.draft,
        )
        .group_by(ArqueoHeader.vault_id)
        .subquery()
    )

    rows = await db.execute(
        select(ArqueoHeader.vault_id, ArqueoHeader.closing_balance).join(
            subq,
            and_(
                ArqueoHeader.vault_id == subq.c.vault_id,
                ArqueoHeader.arqueo_date == subq.c.last_date,
            ),
        )
    )
    return {vid: cb for vid, cb in rows.all()}


async def update_vault(
    db: AsyncSession, vault_id: int, admin_user_id: int, **kwargs
) -> Vault:
    vault = await get_vault(db, vault_id)
    old_values = {k: getattr(vault, k) for k in kwargs if hasattr(vault, k)}

    # Permitir asignar null en campos opcionales (empresa_id, manager_id, treasurer_id)
    nullable_fields = {"empresa_id", "manager_id", "treasurer_id"}
    for k, v in kwargs.items():
        if not hasattr(vault, k):
            continue
        if v is None and k not in nullable_fields:
            continue
        setattr(vault, k, v)

    await log_action(
        db,
        user_id=admin_user_id,
        action="update",
        entity_type="vault",
        entity_id=vault_id,
        old_values=old_values,
        new_values={k: str(v) if isinstance(v, Decimal) else v for k, v in kwargs.items()},
    )
    await db.commit()
    await db.refresh(vault)
    return vault


async def deactivate_vault(
    db: AsyncSession,
    vault_id: int,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    vault = await get_vault(db, vault_id)
    if not vault.is_active:
        raise ConflictError("La bóveda ya está inactiva.")

    vault.is_active = False
    vault.deactivated_at = datetime.now(timezone.utc)

    await log_action(
        db,
        user_id=admin_user_id,
        action="vault_deactivate",
        entity_type="vault",
        entity_id=vault_id,
        old_values={"is_active": True},
        new_values={"is_active": False},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)
    return vault


async def reactivate_vault(
    db: AsyncSession,
    vault_id: int,
    initial_balance: Decimal,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    """Reactiva una bóveda y establece su nuevo saldo inicial."""
    vault = await get_vault(db, vault_id)
    if vault.is_active:
        raise ConflictError("La bóveda ya está activa.")

    vault.is_active = True
    vault.initial_balance = initial_balance
    vault.reactivated_at = datetime.now(timezone.utc)

    await log_action(
        db,
        user_id=admin_user_id,
        action="vault_activate",
        entity_type="vault",
        entity_id=vault_id,
        old_values={"is_active": False},
        new_values={"is_active": True, "initial_balance": str(initial_balance)},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)

    # Notificar reactivación (no bloquea la respuesta)
    _vault_id = vault.id
    asyncio.create_task(_notify_reactivation_task(_vault_id))

    return vault


async def _notify_reactivation_task(vault_id: int) -> None:
    """Envía notificación de reactivación de bóveda en sesión separada."""
    try:
        from app.database import AsyncSessionLocal
        from app.notifications.service import notify_vault_reactivated
        async with AsyncSessionLocal() as db:
            await notify_vault_reactivated(db, vault_id=vault_id)
    except Exception:
        pass


async def set_initial_balance(
    db: AsyncSession,
    vault_id: int,
    initial_balance: Decimal,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    """Establece o actualiza el saldo inicial de una bóveda (solo Admin)."""
    vault = await get_vault(db, vault_id)
    old_balance = vault.initial_balance
    vault.initial_balance = initial_balance

    await log_action(
        db,
        user_id=admin_user_id,
        action="update",
        entity_type="vault",
        entity_id=vault_id,
        old_values={"initial_balance": str(old_balance)},
        new_values={"initial_balance": str(initial_balance)},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)
    return vault
