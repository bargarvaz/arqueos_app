# -*- coding: utf-8 -*-
"""Servicio de bóvedas, sucursales y personal."""

from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_

import asyncio

from app.vaults.models import Vault, Branch
from app.audit.service import log_action
from app.common.background import fire_and_forget
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


async def _ensure_vault_assignment(
    db: AsyncSession,
    user_id: int,
    vault_id: int,
) -> None:
    """Garantiza que `user_id` tenga una UserVaultAssignment activa con
    `vault_id`. Si existe inactiva la reactiva; si no existe la crea.

    Valida que el usuario sea activo y de rol ETV; cualquier otra cosa
    levanta BusinessRuleError. Idempotente: llamadas repetidas no duplican.

    Operación aditiva: nunca desactiva; revocar permisos sigue siendo
    competencia explícita del módulo de usuarios.
    """
    from app.users.models import User, UserVaultAssignment, UserRole
    from app.common.exceptions import BusinessRuleError

    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise BusinessRuleError(
            f"El usuario {user_id} no existe o está inactivo."
        )
    if user.role != UserRole.etv:
        raise BusinessRuleError(
            f"El usuario {user.email} no es ETV; "
            "solo usuarios ETV pueden ser gerente o tesorero de una bóveda."
        )

    result = await db.execute(
        select(UserVaultAssignment).where(
            UserVaultAssignment.user_id == user_id,
            UserVaultAssignment.vault_id == vault_id,
        )
    )
    existing = result.scalar_one_or_none()
    if existing is None:
        db.add(UserVaultAssignment(
            user_id=user_id, vault_id=vault_id, is_active=True,
        ))
    elif not existing.is_active:
        existing.is_active = True
    # Si ya existe activa: noop.


_DENOMINATION_FIELDS = [
    "initial_bill_1000", "initial_bill_500", "initial_bill_200",
    "initial_bill_100", "initial_bill_50", "initial_bill_20",
    "initial_coin_100", "initial_coin_50", "initial_coin_20",
    "initial_coin_10", "initial_coin_5", "initial_coin_2",
    "initial_coin_1", "initial_coin_050", "initial_coin_020", "initial_coin_010",
]


def _denominations_total(denoms: dict[str, Decimal] | None) -> Decimal:
    """Suma los valores monetarios de las denominaciones iniciales."""
    if not denoms:
        return Decimal("0")
    return sum(
        (Decimal(str(denoms.get(f, 0) or 0)) for f in _DENOMINATION_FIELDS),
        start=Decimal("0"),
    )


async def create_vault(
    db: AsyncSession,
    *,
    vault_code: str,
    vault_name: str,
    company_id: int,
    empresa_id: int | None,
    manager_id: int | None,
    treasurer_id: int | None,
    initial_denominations: dict[str, Decimal] | None,
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

    initial_balance = _denominations_total(initial_denominations)
    denom_kwargs = {
        f: Decimal(str((initial_denominations or {}).get(f, 0) or 0))
        for f in _DENOMINATION_FIELDS
    }

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
        **denom_kwargs,
    )
    db.add(vault)
    await db.flush()

    # Auto-asignar gerente/tesorero como ETVs con acceso a esta bóveda.
    # Si llegan ids inválidos, la creación entera se revierte.
    if manager_id is not None:
        await _ensure_vault_assignment(db, manager_id, vault.id)
    if treasurer_id is not None and treasurer_id != manager_id:
        await _ensure_vault_assignment(db, treasurer_id, vault.id)

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
            "initial_denominations": {k: str(v) for k, v in denom_kwargs.items() if v},
            "manager_id": manager_id,
            "treasurer_id": treasurer_id,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)
    return vault


async def update_vault_denominations(
    db: AsyncSession,
    vault_id: int,
    denominations: dict[str, Decimal],
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    """
    Reescribe las denominaciones iniciales y el `initial_balance` derivado.

    Esta operación se trata como un **reset de saldo**: marca
    `balance_reset_at = hoy`, de modo que cualquier cálculo posterior
    (apertura de arqueos, inventario por denominación, saldos finales)
    ignore los arqueos publicados antes de esta fecha. Después dispara una
    notificación a operaciones, admin y los ETV asignados a la bóveda.
    """
    vault = await get_vault(db, vault_id)
    old = {f: getattr(vault, f) for f in _DENOMINATION_FIELDS}
    old["initial_balance"] = vault.initial_balance
    old["balance_reset_at"] = vault.balance_reset_at

    for f in _DENOMINATION_FIELDS:
        if f in denominations:
            setattr(vault, f, Decimal(str(denominations[f] or 0)))
    vault.initial_balance = sum(
        (getattr(vault, f) for f in _DENOMINATION_FIELDS), start=Decimal("0")
    )
    vault.balance_reset_at = date.today()

    await log_action(
        db,
        user_id=admin_user_id,
        action="vault_balance_reset",
        entity_type="vault",
        entity_id=vault_id,
        old_values={k: str(v) for k, v in old.items()},
        new_values={
            **{f: str(getattr(vault, f)) for f in _DENOMINATION_FIELDS},
            "initial_balance": str(vault.initial_balance),
            "balance_reset_at": str(vault.balance_reset_at),
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)

    # Notificar fuera de la transacción principal (no bloquea respuesta)
    fire_and_forget(
        _notify_balance_reset_task(vault.id, admin_user_id),
        name=f"notify-balance-reset-{vault.id}",
    )

    return vault


async def _notify_balance_reset_task(vault_id: int, by_user_id: int) -> None:
    """Envía notificación de reset de saldo en una sesión separada."""
    try:
        from app.database import AsyncSessionLocal
        from app.notifications.service import notify_vault_balance_reset
        async with AsyncSessionLocal() as db:
            await notify_vault_balance_reset(db, vault_id=vault_id, by_user_id=by_user_id)
            await db.commit()
    except Exception:
        # Logging mínimo; las notificaciones no deben tumbar la operación.
        import logging
        logging.getLogger(__name__).exception("Fallo notificando reset de saldo")


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
    prev_manager = vault.manager_id
    prev_treasurer = vault.treasurer_id

    # Permitir asignar null en campos opcionales (empresa_id, manager_id, treasurer_id)
    nullable_fields = {"empresa_id", "manager_id", "treasurer_id"}
    for k, v in kwargs.items():
        if not hasattr(vault, k):
            continue
        if v is None and k not in nullable_fields:
            continue
        setattr(vault, k, v)

    # Auto-asignar gerente/tesorero si fueron seteados (o cambiados a otro
    # usuario). No revoca al des-asignar — eso vive en el módulo de usuarios.
    if "manager_id" in kwargs and vault.manager_id and vault.manager_id != prev_manager:
        await _ensure_vault_assignment(db, vault.manager_id, vault.id)
    if (
        "treasurer_id" in kwargs
        and vault.treasurer_id
        and vault.treasurer_id != prev_treasurer
    ):
        await _ensure_vault_assignment(db, vault.treasurer_id, vault.id)

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
    initial_balance: Decimal | None,
    initial_denominations: dict[str, Decimal] | None,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    """
    Reactiva una bóveda y establece su nuevo saldo inicial.
    Modo preferido: pasar `initial_denominations` (initial_balance se calcula).
    """
    vault = await get_vault(db, vault_id)
    if vault.is_active:
        raise ConflictError("La bóveda ya está activa.")

    if initial_denominations is not None:
        for f in _DENOMINATION_FIELDS:
            setattr(vault, f, Decimal(str(initial_denominations.get(f, 0) or 0)))
        vault.initial_balance = sum(
            (getattr(vault, f) for f in _DENOMINATION_FIELDS), start=Decimal("0")
        )
    else:
        vault.initial_balance = initial_balance or Decimal("0")

    vault.is_active = True
    vault.reactivated_at = datetime.now(timezone.utc)
    # La reactivación equivale a un reset: a partir de hoy los cálculos
    # parten del nuevo saldo inicial, ignorando la historia previa.
    vault.balance_reset_at = date.today()

    await log_action(
        db,
        user_id=admin_user_id,
        action="vault_activate",
        entity_type="vault",
        entity_id=vault_id,
        old_values={"is_active": False},
        new_values={"is_active": True, "initial_balance": str(vault.initial_balance)},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)

    # Notificar reactivación (no bloquea la respuesta)
    fire_and_forget(
        _notify_reactivation_task(vault.id),
        name=f"notify-reactivation-{vault.id}",
    )

    return vault


async def _notify_reactivation_task(vault_id: int) -> None:
    """Envía notificación de reactivación de bóveda en sesión separada."""
    try:
        from app.database import AsyncSessionLocal
        from app.notifications.service import notify_vault_reactivated
        async with AsyncSessionLocal() as db:
            await notify_vault_reactivated(db, vault_id=vault_id)
            await db.commit()
    except Exception:
        # El helper fire_and_forget se encarga del logging.
        raise


async def set_initial_balance(
    db: AsyncSession,
    vault_id: int,
    initial_balance: Decimal | None,
    initial_denominations: dict[str, Decimal] | None,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Vault:
    """
    Establece el saldo inicial. Modo preferido: pasar `initial_denominations` y
    el total se calcula desde ellas. `initial_balance` solo válido cuando todas
    las denominaciones son 0 (modo legacy "sin migrar").
    """
    if initial_denominations is not None:
        return await update_vault_denominations(
            db, vault_id, initial_denominations, admin_user_id, ip_address, user_agent
        )

    vault = await get_vault(db, vault_id)
    old_balance = vault.initial_balance
    vault.initial_balance = initial_balance or Decimal("0")
    # Modo legacy: dejamos las denominaciones como están (en 0 = "sin migrar")

    await log_action(
        db,
        user_id=admin_user_id,
        action="update",
        entity_type="vault",
        entity_id=vault_id,
        old_values={"initial_balance": str(old_balance)},
        new_values={"initial_balance": str(vault.initial_balance)},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(vault)
    return vault
