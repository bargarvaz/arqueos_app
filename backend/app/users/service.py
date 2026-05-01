# -*- coding: utf-8 -*-
"""Servicio de gestión de usuarios (solo Admin)."""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.users.models import User, Company, UserVaultAssignment, UserRole, UserType, EtvSubrole
from app.audit.service import log_action
from app.auth.utils import hash_password, generate_temp_password
from app.common.exceptions import NotFoundError, ConflictError, ForbiddenError, BusinessRuleError
from app.common.pagination import PaginationParams

logger = logging.getLogger(__name__)


async def list_vault_assignments(db: AsyncSession) -> list[dict]:
    """Lista cada bóveda activa con sus usuarios asignados (manager,
    tesorero y cualquier ETV con UserVaultAssignment activa). Devuelve
    una estructura denormalizada lista para mostrar en la UI:
    [{vault_id, vault_code, vault_name, is_active, manager, treasurer,
      users: [{id, full_name, email, etv_subrole, role}]}]
    """
    from app.vaults.models import Vault

    vaults_result = await db.execute(
        select(Vault).order_by(Vault.vault_code)
    )
    vaults = list(vaults_result.scalars().all())
    if not vaults:
        return []

    vault_ids = [v.id for v in vaults]

    # Una sola query: para cada vault sus assignments activas con datos del user.
    rows_result = await db.execute(
        select(UserVaultAssignment.vault_id, User)
        .join(User, User.id == UserVaultAssignment.user_id)
        .where(
            UserVaultAssignment.vault_id.in_(vault_ids),
            UserVaultAssignment.is_active == True,
        )
        .order_by(User.full_name)
    )
    assignments_by_vault: dict[int, list[User]] = {}
    for vid, u in rows_result.all():
        assignments_by_vault.setdefault(vid, []).append(u)

    # Pre-cargar managers/treasurers (un único query agrupado).
    holder_ids = {v.manager_id for v in vaults if v.manager_id} | {
        v.treasurer_id for v in vaults if v.treasurer_id
    }
    holders: dict[int, User] = {}
    if holder_ids:
        h_result = await db.execute(select(User).where(User.id.in_(holder_ids)))
        for u in h_result.scalars().all():
            holders[u.id] = u

    def _user_dict(u: User | None) -> dict | None:
        if u is None:
            return None
        return {
            "id": u.id,
            "full_name": u.full_name,
            "email": u.email,
            "role": u.role.value if hasattr(u.role, "value") else str(u.role),
            "etv_subrole": (
                u.etv_subrole.value
                if u.etv_subrole and hasattr(u.etv_subrole, "value")
                else u.etv_subrole
            ),
            "is_active": u.is_active,
        }

    out: list[dict] = []
    for v in vaults:
        users = assignments_by_vault.get(v.id, [])
        out.append({
            "vault_id": v.id,
            "vault_code": v.vault_code,
            "vault_name": v.vault_name,
            "vault_is_active": v.is_active,
            "manager": _user_dict(holders.get(v.manager_id)) if v.manager_id else None,
            "treasurer": _user_dict(holders.get(v.treasurer_id)) if v.treasurer_id else None,
            "users": [_user_dict(u) for u in users],
        })
    return out


async def count_users_by_role(
    db: AsyncSession, *, is_active: bool | None = None
) -> dict[str, int]:
    """Cuenta usuarios agrupados por rol. Si `is_active` se pasa, filtra por
    ese estado. Devuelve un dict con todas las claves de UserRole (incluso 0)
    + clave `total`.
    """
    from sqlalchemy import func
    query = select(User.role, func.count(User.id)).group_by(User.role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    result = await db.execute(query)

    counts: dict[str, int] = {role.value: 0 for role in UserRole}
    counts["total"] = 0
    for role_val, count in result.all():
        key = role_val.value if hasattr(role_val, "value") else str(role_val)
        counts[key] = count
        counts["total"] += count
    return counts


async def get_primary_admin_id(db: AsyncSession) -> int | None:
    """Devuelve el id del admin "principal" — el de menor id. Es la cuenta
    protegida que nunca puede desactivarse. Si no hay admins (caso degradado)
    devuelve None."""
    from sqlalchemy import func
    result = await db.execute(
        select(func.min(User.id)).where(User.role == UserRole.admin)
    )
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    role: UserRole,
    company_id: int | None,
    empresa_id: int | None = None,
    puesto: str | None = None,
    etv_subrole: EtvSubrole | None = None,
    vault_ids: list[int],
    created_by_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> tuple[User, str]:
    """
    Crea un usuario con contraseña temporal de un solo uso.
    user_type se deriva del rol: etv → external, resto → internal.
    Retorna (usuario, contraseña_temporal).
    """
    # Verificar email único
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise ConflictError(f"El email '{email}' ya está registrado.")

    temp_password = generate_temp_password()

    # user_type derivado del rol
    user_type = UserType.external if role == UserRole.etv else UserType.internal
    mfa_enabled = user_type == UserType.external

    user = User(
        email=email,
        password_hash=hash_password(temp_password),
        full_name=full_name,
        role=role,
        user_type=user_type,
        company_id=company_id,
        empresa_id=empresa_id,
        puesto=puesto,
        etv_subrole=etv_subrole if role == UserRole.etv else None,
        is_active=True,
        must_change_password=True,
        mfa_enabled=mfa_enabled,
    )
    db.add(user)
    await db.flush()  # Obtener el ID

    # Asignar bóvedas si es ETV
    for vault_id in vault_ids:
        assignment = UserVaultAssignment(user_id=user.id, vault_id=vault_id)
        db.add(assignment)

    await log_action(
        db,
        user_id=created_by_user_id,
        action="create",
        entity_type="user",
        entity_id=user.id,
        new_values={
            "email": email,
            "role": role.value,
            "user_type": user_type.value,
            "company_id": company_id,
            "vault_ids": vault_ids,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(user)

    return user, temp_password


async def get_user(db: AsyncSession, user_id: int) -> User:
    """Obtiene un usuario por ID o lanza NotFoundError."""
    user = await db.get(User, user_id)
    if not user:
        raise NotFoundError("Usuario")
    return user


async def list_users(
    db: AsyncSession,
    params: PaginationParams,
    role: str | None = None,
    user_type: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
) -> tuple[list[User], int]:
    """Lista usuarios con filtros y paginación."""
    from sqlalchemy import func, or_

    query = select(User)
    conditions = []

    if role:
        conditions.append(User.role == role)
    if user_type:
        conditions.append(User.user_type == user_type)
    if is_active is not None:
        conditions.append(User.is_active == is_active)
    if search:
        like = f"%{search}%"
        conditions.append(or_(User.full_name.ilike(like), User.email.ilike(like)))

    if conditions:
        query = query.where(and_(*conditions))

    # Total
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Paginación
    query = query.order_by(User.full_name).offset(params.offset).limit(params.limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return list(users), total


async def update_user(
    db: AsyncSession,
    user_id: int,
    *,
    updated_by_user_id: int,
    full_name: str | None = None,
    puesto: str | None = None,
    is_active: bool | None = None,
    company_id: int | None = None,
    empresa_id: int | None = None,
    etv_subrole: EtvSubrole | None = None,
    fields_set: set[str] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> User:
    """
    Actualiza datos del usuario (solo Admin).

    fields_set: nombres de campos enviados explícitamente por el cliente. Permite
    distinguir entre "no enviado" y "enviado como null" para limpiar relaciones.
    Si es None, se usa la convención legacy (None = no actualizar).
    """
    user = await get_user(db, user_id)

    old_values = {
        "full_name": user.full_name,
        "puesto": user.puesto,
        "is_active": user.is_active,
        "company_id": user.company_id,
        "empresa_id": user.empresa_id,
    }

    explicit = fields_set if fields_set is not None else {
        k for k, v in {
            "full_name": full_name, "puesto": puesto, "is_active": is_active,
            "company_id": company_id, "empresa_id": empresa_id,
            "etv_subrole": etv_subrole,
        }.items() if v is not None
    }

    if "full_name" in explicit and full_name is not None:
        user.full_name = full_name
    if "puesto" in explicit:
        user.puesto = puesto
    if "is_active" in explicit and is_active is not None:
        # El admin principal (la cuenta de menor id con rol admin) nunca puede
        # desactivarse. Protege contra autoexclusión y garantiza que siempre
        # haya un canal de control. Otros admins sí pueden desactivarse.
        if not is_active and user.role == UserRole.admin:
            primary_id = await get_primary_admin_id(db)
            if primary_id == user.id:
                raise BusinessRuleError(
                    "La cuenta de administrador principal no puede desactivarse."
                )
        user.is_active = is_active
    if "company_id" in explicit:
        user.company_id = company_id
    if "empresa_id" in explicit:
        user.empresa_id = empresa_id
    if "etv_subrole" in explicit:
        # Solo aplica si el rol es ETV
        user.etv_subrole = etv_subrole if user.role == UserRole.etv else None

    await log_action(
        db,
        user_id=updated_by_user_id,
        action="update" if is_active is None else ("activate" if is_active else "deactivate"),
        entity_type="user",
        entity_id=user.id,
        old_values=old_values,
        new_values={
            "full_name": user.full_name,
            "is_active": user.is_active,
            "company_id": user.company_id,
            "empresa_id": user.empresa_id,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()
    await db.refresh(user)
    return user


async def reset_password(
    db: AsyncSession,
    target_user_id: int,
    *,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> str:
    """
    Admin restablece la contraseña de un usuario.
    Retorna la contraseña temporal (solo se muestra una vez).
    """
    user = await get_user(db, target_user_id)

    temp_password = generate_temp_password()
    user.password_hash = hash_password(temp_password)
    user.must_change_password = True

    await log_action(
        db,
        user_id=admin_user_id,
        action="password_reset",
        entity_type="user",
        entity_id=user.id,
        new_values={"must_change_password": True, "reset_by": admin_user_id},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()

    return temp_password


async def assign_vaults(
    db: AsyncSession,
    user_id: int,
    vault_ids: list[int],
    *,
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """
    Reemplaza las bóvedas asignadas al usuario ETV.
    Desactiva asignaciones previas y crea las nuevas.
    """
    user = await get_user(db, user_id)

    if user.role != UserRole.etv:
        raise ForbiddenError("Solo se pueden asignar bóvedas a usuarios ETV.")

    # Validar que todas las bóvedas existen y están activas
    if vault_ids:
        from app.vaults.models import Vault
        result = await db.execute(
            select(Vault.id).where(
                Vault.id.in_(vault_ids), Vault.is_active == True,
            )
        )
        valid_ids = {row[0] for row in result.all()}
        missing = [vid for vid in vault_ids if vid not in valid_ids]
        if missing:
            raise BusinessRuleError(
                f"Las bóvedas {missing} no existen o no están activas."
            )

    # Obtener asignaciones actuales
    result = await db.execute(
        select(UserVaultAssignment).where(
            UserVaultAssignment.user_id == user_id,
            UserVaultAssignment.is_active == True,
        )
    )
    current_assignments = result.scalars().all()
    old_vault_ids = [a.vault_id for a in current_assignments]

    # Desactivar todas las actuales
    for assignment in current_assignments:
        assignment.is_active = False

    # Crear las nuevas
    for vault_id in vault_ids:
        # Verificar si ya existe (inactiva) para reutilizar
        existing = await db.execute(
            select(UserVaultAssignment).where(
                UserVaultAssignment.user_id == user_id,
                UserVaultAssignment.vault_id == vault_id,
            )
        )
        ex = existing.scalar_one_or_none()
        if ex:
            ex.is_active = True
        else:
            db.add(UserVaultAssignment(user_id=user_id, vault_id=vault_id, is_active=True))

    await log_action(
        db,
        user_id=admin_user_id,
        action="vault_assignment",
        entity_type="user",
        entity_id=user_id,
        old_values={"vault_ids": old_vault_ids},
        new_values={"vault_ids": vault_ids},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()


async def get_user_assigned_vault_ids(db: AsyncSession, user_id: int) -> list[int]:
    """Retorna IDs de bóvedas activas asignadas al usuario."""
    result = await db.execute(
        select(UserVaultAssignment.vault_id).where(
            UserVaultAssignment.user_id == user_id,
            UserVaultAssignment.is_active == True,
        )
    )
    return list(result.scalars().all())
