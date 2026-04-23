# -*- coding: utf-8 -*-
"""Servicio de bóvedas, sucursales y personal."""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

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

async def create_vault(
    db: AsyncSession,
    *,
    vault_code: str,
    vault_name: str,
    company_id: int,
    branch_id: int,
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

    vault = Vault(
        vault_code=vault_code,
        vault_name=vault_name,
        company_id=company_id,
        branch_id=branch_id,
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


async def update_vault(
    db: AsyncSession, vault_id: int, admin_user_id: int, **kwargs
) -> Vault:
    vault = await get_vault(db, vault_id)
    old_values = {k: getattr(vault, k) for k in kwargs if hasattr(vault, k)}

    for k, v in kwargs.items():
        if v is not None and hasattr(vault, k):
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
    return vault


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
