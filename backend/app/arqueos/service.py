# -*- coding: utf-8 -*-
"""
Servicio core de arqueos: cabeceras, registros, publicación y recálculo en cascada.
"""

import asyncio
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, update

from app.arqueos.models import ArqueoHeader, ArqueoRecord, ArqueoStatus
from app.arqueos.validators import validate_record, is_row_empty, DENOMINATION_MULTIPLIERS
from app.audit.service import log_action
from app.common.exceptions import (
    NotFoundError,
    ConflictError,
    ForbiddenError,
    BusinessRuleError,
    ValidationAppError,
)
from app.common.id_generator import generate_unique_uid

logger = logging.getLogger(__name__)

# Semáforos por vault_id para recálculo en cascada serializado
_cascade_locks: dict[int, asyncio.Lock] = {}
_cascade_locks_lock = asyncio.Lock()


async def _get_cascade_lock(vault_id: int) -> asyncio.Lock:
    """Retorna un lock individual por vault_id (crea si no existe)."""
    async with _cascade_locks_lock:
        if vault_id not in _cascade_locks:
            _cascade_locks[vault_id] = asyncio.Lock()
        return _cascade_locks[vault_id]


# ─── Opening balance ──────────────────────────────────────────────────────────

async def _get_opening_balance(db: AsyncSession, vault_id: int, arqueo_date: date) -> Decimal:
    """
    Calcula el saldo de apertura del día.
    = closing_balance del día anterior más reciente.
    Si no hay días anteriores, usa vaults.initial_balance.
    """
    # Buscar el header del día anterior más reciente
    result = await db.execute(
        select(ArqueoHeader.closing_balance)
        .where(
            ArqueoHeader.vault_id == vault_id,
            ArqueoHeader.arqueo_date < arqueo_date,
            ArqueoHeader.status != ArqueoStatus.draft,
        )
        .order_by(ArqueoHeader.arqueo_date.desc())
        .limit(1)
    )
    prev_closing = result.scalar_one_or_none()

    if prev_closing is not None:
        return Decimal(str(prev_closing))

    # Primer arqueo: usar initial_balance de la bóveda
    from app.vaults.models import Vault
    vault = await db.get(Vault, vault_id)
    if vault:
        return Decimal(str(vault.initial_balance))
    return Decimal("0")


def _calculate_closing_balance(
    opening_balance: Decimal, records: list[ArqueoRecord]
) -> Decimal:
    """Calcula el closing_balance sumando entradas y restando salidas."""
    total_entries = sum(Decimal(str(r.entries)) for r in records if r.is_active)
    total_withdrawals = sum(Decimal(str(r.withdrawals)) for r in records if r.is_active)
    return opening_balance + total_entries - total_withdrawals


# ─── Recálculo en cascada ──────────────────────────────────────────────────────

async def recalculate_cascade(
    db: AsyncSession, vault_id: int, from_date: date
) -> None:
    """
    Recalcula opening_balance y closing_balance de todos los headers
    de la bóveda desde `from_date` en adelante.
    Se ejecuta con lock por vault_id para evitar concurrencia.
    """
    import time
    lock = await _get_cascade_lock(vault_id)

    async with lock:
        t0 = time.monotonic()
        logger.info("Iniciando cascada para vault_id=%d desde %s", vault_id, from_date)

        # Obtener todos los headers publicados/locked a partir de from_date, en orden
        result = await db.execute(
            select(ArqueoHeader)
            .where(
                and_(
                    ArqueoHeader.vault_id == vault_id,
                    ArqueoHeader.arqueo_date >= from_date,
                    ArqueoHeader.status != ArqueoStatus.draft,
                )
            )
            .order_by(ArqueoHeader.arqueo_date)
        )
        headers = result.scalars().all()

        prev_closing = await _get_opening_balance(db, vault_id, from_date)

        for header in headers:
            # Recargar registros activos
            records_result = await db.execute(
                select(ArqueoRecord).where(
                    ArqueoRecord.arqueo_header_id == header.id,
                    ArqueoRecord.is_active == True,
                )
            )
            records = records_result.scalars().all()

            new_closing = _calculate_closing_balance(prev_closing, records)

            # Actualizar solo si cambió
            if Decimal(str(header.opening_balance)) != prev_closing or Decimal(str(header.closing_balance)) != new_closing:
                await db.execute(
                    update(ArqueoHeader)
                    .where(ArqueoHeader.id == header.id)
                    .values(opening_balance=prev_closing, closing_balance=new_closing)
                )

            prev_closing = new_closing

        await db.flush()
        elapsed = time.monotonic() - t0
        logger.info(
            "Cascada completada para vault_id=%d — %d headers en %.3fs",
            vault_id,
            len(headers),
            elapsed,
        )


# ─── Header ───────────────────────────────────────────────────────────────────

async def get_or_create_header(
    db: AsyncSession,
    vault_id: int,
    arqueo_date: date,
    user_id: int,
) -> ArqueoHeader:
    """
    Retorna el header del día si existe, o lo crea con el opening_balance calculado.
    """
    result = await db.execute(
        select(ArqueoHeader).where(
            ArqueoHeader.vault_id == vault_id,
            ArqueoHeader.arqueo_date == arqueo_date,
        )
    )
    header = result.scalar_one_or_none()

    if not header:
        opening_balance = await _get_opening_balance(db, vault_id, arqueo_date)
        header = ArqueoHeader(
            vault_id=vault_id,
            arqueo_date=arqueo_date,
            opening_balance=opening_balance,
            closing_balance=opening_balance,
            status=ArqueoStatus.draft,
            created_by=user_id,
        )
        db.add(header)
        await db.flush()

    return header


async def get_header(db: AsyncSession, header_id: int) -> ArqueoHeader:
    header = await db.get(ArqueoHeader, header_id)
    if not header:
        raise NotFoundError("Arqueo")
    return header


async def list_headers(
    db: AsyncSession,
    vault_id: int | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[ArqueoHeader], int]:
    query = select(ArqueoHeader)
    conditions = []

    if vault_id:
        conditions.append(ArqueoHeader.vault_id == vault_id)
    if status:
        conditions.append(ArqueoHeader.status == status)
    if date_from:
        conditions.append(ArqueoHeader.arqueo_date >= date_from)
    if date_to:
        conditions.append(ArqueoHeader.arqueo_date <= date_to)

    if conditions:
        query = query.where(and_(*conditions))

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(ArqueoHeader.arqueo_date.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    return list(result.scalars().all()), total


# ─── ETV: bóvedas asignadas con estado del día ────────────────────────────────

async def get_etv_vaults(db: AsyncSession, user_id: int) -> list[dict]:
    """
    Retorna las bóvedas activas asignadas al ETV con el estado del arqueo de hoy.
    """
    from app.users.models import UserVaultAssignment
    from app.vaults.models import Vault

    today = date.today()

    result = await db.execute(
        select(UserVaultAssignment, Vault)
        .join(Vault, Vault.id == UserVaultAssignment.vault_id)
        .where(
            UserVaultAssignment.user_id == user_id,
            UserVaultAssignment.is_active == True,
            Vault.is_active == True,
        )
    )
    rows = result.all()

    vaults_with_status = []
    for assignment, vault in rows:
        # Buscar header del día para esta bóveda
        header_result = await db.execute(
            select(ArqueoHeader).where(
                ArqueoHeader.vault_id == vault.id,
                ArqueoHeader.arqueo_date == today,
            )
        )
        header = header_result.scalar_one_or_none()

        vaults_with_status.append({
            "vault": {
                "id": vault.id,
                "vault_code": vault.vault_code,
                "vault_name": vault.vault_name,
                "initial_balance": str(vault.initial_balance),
                "branch_id": vault.branch_id,
            },
            "today_status": header.status if header else None,
            "today_header_id": header.id if header else None,
            "today_closing_balance": str(header.closing_balance) if header else None,
        })

    return vaults_with_status


# ─── Records ──────────────────────────────────────────────────────────────────

async def _verify_vault_assignment(db: AsyncSession, user_id: int, vault_id: int) -> None:
    """Verifica que el usuario ETV sigue asignado a la bóveda. Lanza ForbiddenError si no."""
    from app.users.models import UserVaultAssignment
    result = await db.execute(
        select(UserVaultAssignment).where(
            UserVaultAssignment.user_id == user_id,
            UserVaultAssignment.vault_id == vault_id,
            UserVaultAssignment.is_active == True,
        )
    )
    if not result.scalar_one_or_none():
        raise ForbiddenError(
            "Ya no tienes asignada esta bóveda. Contacta al administrador."
        )


async def _check_holiday(db: AsyncSession, record_date: date) -> bool:
    """Retorna True si la fecha es fin de semana o día inhábil."""
    from app.catalogs.models import Holiday
    if record_date.weekday() >= 5:  # Sábado=5, Domingo=6
        return True
    result = await db.execute(
        select(Holiday).where(
            Holiday.holiday_date == record_date,
            Holiday.is_active == True,
        )
    )
    return result.scalar_one_or_none() is not None


async def publish_arqueo(
    db: AsyncSession,
    vault_id: int,
    arqueo_date: date,
    records_data: list[dict[str, Any]],
    user_id: int,
    expected_updated_at: datetime,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> ArqueoHeader:
    """
    Publica el arqueo del día:
    1. Verifica asignación de bóveda
    2. Optimistic locking en el header
    3. Valida y persiste registros
    4. Recalcula closing_balance
    5. Notifica a Operaciones
    6. Inicia recálculo en cascada de días posteriores
    """
    # 1. Verificar asignación
    await _verify_vault_assignment(db, user_id, vault_id)

    # 2. Obtener/crear header
    header = await get_or_create_header(db, vault_id, arqueo_date, user_id)

    # 3. Optimistic locking — comparar updated_at
    if header.updated_at and header.updated_at != expected_updated_at:
        raise ConflictError(
            "La información de esta bóveda fue actualizada por otro usuario o sesión. "
            "Por favor, recargue la página para ver los cambios más recientes."
        )

    # 4. Filtrar filas vacías y validar las no-vacías
    valid_records_data = []
    for rd in records_data:
        if is_row_empty(rd):
            continue
        validate_record(rd)
        valid_records_data.append(rd)

    # 5. Desactivar registros existentes del día (solo actuales, sin contrapartida)
    existing = await db.execute(
        select(ArqueoRecord).where(
            ArqueoRecord.arqueo_header_id == header.id,
            ArqueoRecord.is_active == True,
            ArqueoRecord.is_counterpart == False,
        )
    )
    existing_records = {r.record_uid: r for r in existing.scalars().all()}

    # 6. Upsert de registros
    saved_records: list[ArqueoRecord] = []

    for rd in valid_records_data:
        uid = rd.get("record_uid")
        if uid and uid in existing_records:
            # Actualización de registro existente del día
            rec = existing_records[uid]
            old_snapshot = _record_snapshot(rec)
            _apply_record_data(rec, rd)
            await log_action(
                db,
                user_id=user_id,
                action="update",
                entity_type="arqueo_record",
                entity_id=rec.id,
                old_values=old_snapshot,
                new_values=_record_snapshot(rec),
                ip_address=ip_address,
                user_agent=user_agent,
            )
            saved_records.append(rec)
        else:
            # Nuevo registro
            new_uid = await generate_unique_uid(db, ArqueoRecord, "record_uid")
            rec = ArqueoRecord(
                record_uid=new_uid,
                arqueo_header_id=header.id,
                created_by=user_id,
                **{k: v for k, v in rd.items() if k != "record_uid"},
            )
            db.add(rec)
            await db.flush()
            saved_records.append(rec)

    # 7. Calcular closing_balance
    all_active_records = await db.execute(
        select(ArqueoRecord).where(
            ArqueoRecord.arqueo_header_id == header.id,
            ArqueoRecord.is_active == True,
        )
    )
    all_records = all_active_records.scalars().all()
    opening = Decimal(str(header.opening_balance))
    closing = _calculate_closing_balance(opening, all_records)

    header.closing_balance = closing
    header.status = ArqueoStatus.published
    if not header.published_at:
        header.published_at = datetime.now(timezone.utc)

    await log_action(
        db,
        user_id=user_id,
        action="publish",
        entity_type="arqueo_header",
        entity_id=header.id,
        new_values={
            "vault_id": vault_id,
            "arqueo_date": str(arqueo_date),
            "closing_balance": str(closing),
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )

    # 8. Detectar si es día inhábil y generar notificación
    is_holiday = await _check_holiday(db, arqueo_date)
    negative_balance = closing < 0

    await db.commit()
    await db.refresh(header)

    # 9. Recálculo en cascada (asíncrono, dentro de nueva sesión)
    asyncio.create_task(_cascade_task(vault_id, arqueo_date))

    # 10. Notificaciones reales
    asyncio.create_task(
        _notify_publish_task(
            vault_id=vault_id,
            arqueo_date=arqueo_date,
            header_id=header.id,
            closing_balance=float(closing),
            negative_balance=negative_balance,
            is_holiday=is_holiday,
            published_by=user_id,
        )
    )

    return header


async def _notify_publish_task(
    vault_id: int,
    arqueo_date: date,
    header_id: int,
    closing_balance: float,
    negative_balance: bool,
    is_holiday: bool,
    published_by: int,
) -> None:
    """Envía notificaciones post-publicación en sesión separada."""
    from app.database import AsyncSessionLocal
    from app.notifications.service import (
        notify_arqueo_published,
        notify_negative_balance,
        notify_weekend_upload,
    )
    from app.vaults.models import Vault

    async with AsyncSessionLocal() as db:
        try:
            vault = await db.get(Vault, vault_id)
            vault_code = vault.vault_code if vault else str(vault_id)

            await notify_arqueo_published(
                db, vault_code, arqueo_date, header_id, published_by
            )
            if negative_balance:
                await notify_negative_balance(
                    db, vault_code, arqueo_date, f"{closing_balance:.2f}",
                    header_id, published_by
                )
            if is_holiday:
                await notify_weekend_upload(
                    db, vault_code, arqueo_date, header_id, published_by
                )
            await db.commit()
        except Exception as exc:
            logger.error("Error enviando notificaciones de publicación: %s", exc)


async def _cascade_task(vault_id: int, from_date: date) -> None:
    """Tarea asíncrona para el recálculo en cascada fuera del request actual."""
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            await recalculate_cascade(db, vault_id, from_date)
            await db.commit()
        except Exception as exc:
            logger.error("Error en cascada vault_id=%d: %s", vault_id, exc)


def _record_snapshot(record: ArqueoRecord) -> dict:
    """Genera un snapshot JSONB del registro para el audit log."""
    return {
        "record_uid": record.record_uid,
        "voucher": record.voucher,
        "reference": record.reference,
        "branch_id": record.branch_id,
        "entries": str(record.entries),
        "withdrawals": str(record.withdrawals),
        "movement_type_id": record.movement_type_id,
    }


def _apply_record_data(record: ArqueoRecord, data: dict[str, Any]) -> None:
    """Aplica los datos del request al modelo de registro."""
    fields = [
        "voucher", "reference", "branch_id", "movement_type_id",
        "entries", "withdrawals", "record_date",
    ] + list(DENOMINATION_MULTIPLIERS.keys())

    for field in fields:
        if field in data:
            setattr(record, field, data[field])
