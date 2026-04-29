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

    Si la bóveda tuvo un reset de saldo (`balance_reset_at`), solo se consideran
    los headers POSTERIORES a esa fecha. Si no existe header posterior, la
    apertura se calcula con `vault.initial_balance` actual.
    """
    from app.vaults.models import Vault
    vault = await db.get(Vault, vault_id)

    conditions = [
        ArqueoHeader.vault_id == vault_id,
        ArqueoHeader.arqueo_date < arqueo_date,
        ArqueoHeader.status != ArqueoStatus.draft,
    ]
    if vault and vault.balance_reset_at is not None:
        conditions.append(ArqueoHeader.arqueo_date >= vault.balance_reset_at)

    result = await db.execute(
        select(ArqueoHeader.closing_balance)
        .where(*conditions)
        .order_by(ArqueoHeader.arqueo_date.desc())
        .limit(1)
    )
    prev_closing = result.scalar_one_or_none()

    if prev_closing is not None:
        return Decimal(str(prev_closing))

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
    """
    Carga el header con sus records activos eager-loaded.

    Importante usar selectinload aquí: db.get() retorna el header pero la
    relationship `records` (lazy='selectin') no siempre se hidrata en contexto
    async, lo que causaba que el frontend recibiera `records: []` aunque la BD
    tuviera registros activos.
    """
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(ArqueoHeader)
        .options(selectinload(ArqueoHeader.records))
        .where(ArqueoHeader.id == header_id)
    )
    header = result.scalar_one_or_none()
    if not header:
        raise NotFoundError("Arqueo")
    return header


async def list_headers(
    db: AsyncSession,
    vault_id: int | None = None,
    vault_ids: list[int] | None = None,
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[ArqueoHeader], int]:
    from app.vaults.models import Vault as _Vault

    query = select(ArqueoHeader).join(_Vault, _Vault.id == ArqueoHeader.vault_id)
    conditions = [
        # Respeta el reset de saldo: oculta headers anteriores al día del reset
        (_Vault.balance_reset_at.is_(None))
        | (ArqueoHeader.arqueo_date >= _Vault.balance_reset_at),
    ]

    if vault_ids is not None:
        if not vault_ids:
            return [], 0
        conditions.append(ArqueoHeader.vault_id.in_(vault_ids))
    elif vault_id:
        conditions.append(ArqueoHeader.vault_id == vault_id)
    if status:
        conditions.append(ArqueoHeader.status == status)
    if date_from:
        conditions.append(ArqueoHeader.arqueo_date >= date_from)
    if date_to:
        conditions.append(ArqueoHeader.arqueo_date <= date_to)

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

    # 4.5. Validar inventario por denominación intra-día (orden de captura)
    inventory_start = await get_denomination_inventory(db, vault_id, arqueo_date)
    issues = validate_denomination_balance(
        inventory_start, valid_records_data, intraday=True,
    )
    if issues:
        # En intraday todos los issues son del mismo paso (mismo row)
        row = issues[0].get("row")
        details = ", ".join(
            f"{i['denomination']} (disponible ${i['available']}, faltan ${i['deficit']})"
            for i in issues
        )
        from app.common.exceptions import ValidationAppError
        prefix = f"Fila {row}: " if row else ""
        raise ValidationAppError(
            f"{prefix}no hay suficientes denominaciones para esa salida — {details}. "
            "Reordena los movimientos para que las entradas ocurran antes que las salidas, "
            "o ajusta las denominaciones."
        )

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
            # Aplicar coerción de tipos a los campos del payload
            coerced = {
                k: _coerce_field_value(k, v)
                for k, v in rd.items()
                if k != "record_uid"
            }
            rec = ArqueoRecord(
                record_uid=new_uid,
                arqueo_header_id=header.id,
                created_by=user_id,
                **coerced,
            )
            db.add(rec)
            await db.flush()
            saved_records.append(rec)

    # 7. Desactivar registros previos que ya no están en la nueva publicación
    matched_uids = {r.record_uid for r in saved_records}
    for uid, rec in existing_records.items():
        if uid not in matched_uids:
            rec.is_active = False

    # 8. Calcular closing_balance
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


async def auto_publish_expired_drafts(db: AsyncSession, target_date: date) -> list[int]:
    """
    Publica automáticamente en blanco todos los headers en estado 'draft'
    cuya arqueo_date sea anterior a target_date.

    Retorna lista de header_ids que fueron auto-publicados.
    """
    result = await db.execute(
        select(ArqueoHeader).where(
            ArqueoHeader.status == ArqueoStatus.draft,
            ArqueoHeader.arqueo_date < target_date,
        )
    )
    drafts = result.scalars().all()
    auto_ids: list[int] = []

    for header in drafts:
        # closing_balance = opening_balance (sin registros = sin movimientos)
        header.status = ArqueoStatus.published
        header.auto_published = True
        header.closing_balance = header.opening_balance
        if not header.published_at:
            header.published_at = datetime.now(timezone.utc)
        auto_ids.append(header.id)
        logger.info(
            "Auto-publicado en blanco: header_id=%d vault_id=%d fecha=%s",
            header.id, header.vault_id, header.arqueo_date,
        )

    if auto_ids:
        await db.commit()

    return auto_ids


async def ensure_blank_headers_for_range(
    db: AsyncSession,
    vault_id: int,
    start_date: date,
    end_date: date,
    created_by: int,
) -> list[int]:
    """
    Asegura que existe un header (auto_published en blanco si falta) para cada
    día en [start_date, end_date]. Útil para que el ETV pueda agregar movimientos
    vía modificaciones a días que nunca se arquearon.

    No toca días que ya tienen header. Calcula opening de los días faltantes
    como el último closing previo (o initial_balance).

    Retorna la lista de header_ids creados.
    """
    if start_date > end_date:
        return []

    # Días ya con header
    existing_q = await db.execute(
        select(ArqueoHeader.arqueo_date).where(
            ArqueoHeader.vault_id == vault_id,
            ArqueoHeader.arqueo_date >= start_date,
            ArqueoHeader.arqueo_date <= end_date,
        )
    )
    existing_dates = {row[0] for row in existing_q.all()}

    # Si todos los días ya están cubiertos, salir rápido
    total_days = (end_date - start_date).days + 1
    if len(existing_dates) >= total_days:
        return []

    from datetime import timedelta

    created_ids: list[int] = []
    current = start_date
    while current <= end_date:
        if current not in existing_dates:
            opening = await _get_opening_balance(db, vault_id, current)
            header = ArqueoHeader(
                vault_id=vault_id,
                arqueo_date=current,
                opening_balance=opening,
                closing_balance=opening,
                status=ArqueoStatus.published,
                auto_published=True,
                published_at=datetime.now(timezone.utc),
                created_by=created_by,
            )
            db.add(header)
            await db.flush()
            created_ids.append(header.id)
        current += timedelta(days=1)

    if created_ids:
        await db.commit()
        logger.info(
            "ensure_blank_headers: %d headers en blanco creados para vault_id=%d (%s..%s)",
            len(created_ids), vault_id, start_date, end_date,
        )

    return created_ids


# ─── Inventario por denominación ─────────────────────────────────────────────

DENOMINATION_FIELDS = [
    "bill_1000", "bill_500", "bill_200",
    "bill_100", "bill_50", "bill_20",
    "coin_100", "coin_50", "coin_20",
    "coin_10", "coin_5", "coin_2",
    "coin_1", "coin_050", "coin_020", "coin_010",
]


def _initial_denomination_field(record_field: str) -> str:
    """Mapea bill_1000 → initial_bill_1000."""
    return f"initial_{record_field}"


async def get_denomination_inventory(
    db: AsyncSession,
    vault_id: int,
    before_date: date,
) -> dict[str, Decimal]:
    """
    Inventario de la bóveda por denominación al inicio de `before_date`.

    Para cada denominación: initial_<denom> + Σ(entries en records activos no
    contrapartida con arqueo_date < before_date) - Σ(withdrawals).

    Si la bóveda está "sin migrar" (initial_balance > 0 pero todas las
    initial_<denom> son 0), retorna un dict con None para cada denominación,
    señalando al caller que la validación debe relajarse.
    """
    from app.vaults.models import Vault

    vault = await db.get(Vault, vault_id)
    if not vault:
        return {f: Decimal("0") for f in DENOMINATION_FIELDS}

    initial = {
        f: Decimal(str(getattr(vault, _initial_denomination_field(f)) or 0))
        for f in DENOMINATION_FIELDS
    }
    is_unmigrated = (
        Decimal(str(vault.initial_balance or 0)) > 0
        and all(v == 0 for v in initial.values())
    )
    if is_unmigrated:
        # Marcador: caller no debe validar
        return {f: None for f in DENOMINATION_FIELDS}

    # Sumar registros activos no-contrapartida hasta before_date (exclusive).
    # Si hubo reset de saldo, ignoramos arqueos anteriores o iguales a esa fecha.
    inventory = dict(initial)

    record_cols = [getattr(ArqueoRecord, f) for f in DENOMINATION_FIELDS]
    where_clauses = [
        ArqueoHeader.vault_id == vault_id,
        ArqueoHeader.arqueo_date < before_date,
        ArqueoHeader.status != ArqueoStatus.draft,
        ArqueoRecord.is_active == True,
        ArqueoRecord.is_counterpart == False,
    ]
    if vault.balance_reset_at is not None:
        where_clauses.append(ArqueoHeader.arqueo_date >= vault.balance_reset_at)

    rows = await db.execute(
        select(
            ArqueoRecord.entries,
            ArqueoRecord.withdrawals,
            *record_cols,
        )
        .join(ArqueoHeader, ArqueoHeader.id == ArqueoRecord.arqueo_header_id)
        .where(*where_clauses)
    )

    for row in rows.all():
        entries = Decimal(str(row[0] or 0))
        # row[2:] son las denominaciones en el orden de DENOMINATION_FIELDS
        sign = Decimal("1") if entries > 0 else Decimal("-1")
        for i, field in enumerate(DENOMINATION_FIELDS):
            value = Decimal(str(row[2 + i] or 0))
            inventory[field] += sign * value

    return inventory


# ─── Saldos finales mensuales (cierres por día) ───────────────────────────────

async def get_monthly_closings(
    db: AsyncSession,
    vault_id: int,
    year: int,
    month: int,
) -> dict[str, Any]:
    """
    Construye los saldos finales (cierre por denominación + total) de cada día
    publicado del mes para la bóveda dada.

    Reglas:
      - Una bóveda solo "existe" desde su día ancla: el más reciente entre su
        fecha de creación y un eventual reset de saldo. Días anteriores al
        ancla nunca se reportan.
      - Si el día ancla cae dentro del mes consultado y no hay arqueo publicado
        ese día, se inserta una fila sintética con el saldo inicial declarado
        (bandera `is_anchor=True`).
      - Días posteriores al ancla solo aparecen cuando tienen arqueo publicado
        o locked.
      - Si la bóveda está "sin migrar" (initial_balance > 0 con denominaciones
        en 0), `unmigrated=True` y las denominaciones del corrido reflejan
        únicamente los movimientos posteriores, no el stock real.
    """
    from app.vaults.models import Vault
    from calendar import monthrange

    if not (1 <= month <= 12):
        raise ValidationAppError("Mes inválido (debe estar entre 1 y 12).")

    vault = await db.get(Vault, vault_id)
    if not vault:
        raise NotFoundError("Bóveda")

    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])

    # ─── Día ancla: max(creación, reset) ─────────────────────────────────────
    created_date = (
        vault.created_at.date() if isinstance(vault.created_at, datetime)
        else vault.created_at
    )
    anchor_date = vault.balance_reset_at or created_date
    if vault.balance_reset_at and created_date and vault.balance_reset_at < created_date:
        anchor_date = created_date

    # Si la bóveda aún no existe en este mes → respuesta vacía
    if anchor_date > last_day:
        return {
            "vault_id": vault.id,
            "vault_code": vault.vault_code,
            "vault_name": vault.vault_name,
            "year": year,
            "month": month,
            "unmigrated": False,
            "items": [],
        }

    # ─── Inventario al inicio del mes ────────────────────────────────────────
    base_inventory = await get_denomination_inventory(db, vault_id, first_day)
    unmigrated = any(v is None for v in base_inventory.values())
    running = {f: Decimal("0") if base_inventory[f] is None else base_inventory[f]
               for f in DENOMINATION_FIELDS}

    # ─── Headers del mes (después del ancla, no draft) ───────────────────────
    header_conditions = [
        ArqueoHeader.vault_id == vault_id,
        ArqueoHeader.arqueo_date >= max(first_day, anchor_date),
        ArqueoHeader.arqueo_date <= last_day,
        ArqueoHeader.status != ArqueoStatus.draft,
    ]
    headers_result = await db.execute(
        select(ArqueoHeader)
        .where(*header_conditions)
        .order_by(ArqueoHeader.arqueo_date.asc())
    )
    headers = list(headers_result.scalars().all())

    items: list[dict[str, Any]] = []

    # ─── Fila sintética del día ancla, si cae en este mes y no tiene arqueo ─
    if first_day <= anchor_date <= last_day:
        anchor_has_header = any(h.arqueo_date == anchor_date for h in headers)
        if not anchor_has_header:
            anchor_item: dict[str, Any] = {
                "arqueo_date": anchor_date,
                "status": ArqueoStatus.published,  # placeholder para el schema
                "closing_balance": Decimal(str(vault.initial_balance or 0)),
                "is_anchor": True,
            }
            for f in DENOMINATION_FIELDS:
                anchor_item[f] = running[f]
            items.append(anchor_item)

    # ─── Filas reales de arqueos ─────────────────────────────────────────────
    for h in headers:
        for r in h.records:
            if not r.is_active or r.is_counterpart:
                continue
            entries = Decimal(str(r.entries or 0))
            sign = Decimal("1") if entries > 0 else Decimal("-1")
            for f in DENOMINATION_FIELDS:
                val = Decimal(str(getattr(r, f) or 0))
                running[f] += sign * val

        item: dict[str, Any] = {
            "arqueo_date": h.arqueo_date,
            "status": h.status,
            "closing_balance": Decimal(str(h.closing_balance or 0)),
            "is_anchor": False,
        }
        for f in DENOMINATION_FIELDS:
            item[f] = running[f]
        items.append(item)

    items.sort(key=lambda x: x["arqueo_date"])

    return {
        "vault_id": vault.id,
        "vault_code": vault.vault_code,
        "vault_name": vault.vault_name,
        "year": year,
        "month": month,
        "unmigrated": unmigrated,
        "items": items,
    }


DENOM_LABELS = {
    "bill_1000": "billete $1,000", "bill_500": "billete $500",
    "bill_200": "billete $200", "bill_100": "billete $100",
    "bill_50": "billete $50", "bill_20": "billete $20",
    "coin_100": "moneda $100", "coin_50": "moneda $50",
    "coin_20": "moneda $20", "coin_10": "moneda $10",
    "coin_5": "moneda $5", "coin_2": "moneda $2",
    "coin_1": "moneda $1", "coin_050": "moneda $0.50",
    "coin_020": "moneda $0.20", "coin_010": "moneda $0.10",
}


def _record_entry_amount(r: dict | ArqueoRecord) -> Decimal:
    if isinstance(r, dict):
        return Decimal(str(r.get("entries", 0) or 0))
    return Decimal(str(r.entries or 0))


def _record_denom(r: dict | ArqueoRecord, field: str) -> Decimal:
    if isinstance(r, dict):
        return Decimal(str(r.get(field, 0) or 0))
    return Decimal(str(getattr(r, field, 0) or 0))


def validate_denomination_balance(
    inventory_start: dict[str, Decimal | None],
    records: list[dict] | list[ArqueoRecord],
    intraday: bool = False,
) -> list[dict]:
    """
    Valida que aplicando los movimientos `records` sobre `inventory_start` ninguna
    denominación quede negativa.

    - intraday=False: revisa el balance al final (cierre del día). Reporta TODAS
      las denominaciones que terminan en negativo.
    - intraday=True: revisa paso a paso en el orden de la lista. Reporta el
      PRIMER registro donde alguna denominación queda en negativo, indicando
      el índice (1-based) y la denominación violatoria.

    Retorna lista de dicts:
      - {"row": int|None, "denomination": str, "available": Decimal, "deficit": Decimal}
      - Lista vacía = válido.

    Si inventory_start tiene None (bóveda "sin migrar"), retorna [] sin validar.
    """
    if any(v is None for v in inventory_start.values()):
        return []

    state = {f: Decimal(str(v or 0)) for f, v in inventory_start.items()}

    if intraday:
        for ix, r in enumerate(records, start=1):
            entry_amt = _record_entry_amount(r)
            sign = Decimal("1") if entry_amt > 0 else Decimal("-1")
            issues_this_step = []
            for f in DENOMINATION_FIELDS:
                state[f] += sign * _record_denom(r, f)
                if state[f] < 0:
                    issues_this_step.append({
                        "row": ix,
                        "denomination": DENOM_LABELS[f],
                        "available": state[f] - sign * _record_denom(r, f),  # antes del paso
                        "deficit": -state[f],
                    })
            if issues_this_step:
                return issues_this_step
        return []

    # Validación al cierre
    for r in records:
        sign = Decimal("1") if _record_entry_amount(r) > 0 else Decimal("-1")
        for f in DENOMINATION_FIELDS:
            state[f] += sign * _record_denom(r, f)

    return [
        {
            "row": None,
            "denomination": DENOM_LABELS[f],
            "available": inventory_start[f],
            "deficit": -state[f],
        }
        for f in DENOMINATION_FIELDS
        if state[f] < 0
    ]


def _record_snapshot(record: ArqueoRecord) -> dict:
    """Genera un snapshot JSONB del registro para el audit log."""
    return {
        "record_uid": record.record_uid,
        "voucher": record.voucher,
        "reference": record.reference,
        "sucursal_id": record.sucursal_id,
        "entries": str(record.entries),
        "withdrawals": str(record.withdrawals),
        "movement_type_id": record.movement_type_id,
    }


_INT_FIELDS = {"sucursal_id", "movement_type_id"}
_DATE_FIELDS = {"record_date"}


def _coerce_field_value(field: str, value: Any) -> Any:
    """Coerciona valores que vienen como string del frontend al tipo de la columna."""
    if field in _INT_FIELDS:
        if value is None or value == "" or value == 0 or value == "0":
            return None if field == "sucursal_id" else value  # movement_type_id requerido
        try:
            return int(value)
        except (ValueError, TypeError):
            return value
    if field in _DATE_FIELDS:
        if isinstance(value, date):
            return value
        if value is None or value == "":
            return None
        try:
            return date.fromisoformat(str(value)[:10])
        except (ValueError, TypeError):
            return value
    return value


def _apply_record_data(record: ArqueoRecord, data: dict[str, Any]) -> None:
    """Aplica los datos del request al modelo de registro."""
    fields = [
        "voucher", "reference", "sucursal_id", "movement_type_id",
        "entries", "withdrawals", "record_date",
    ] + list(DENOMINATION_MULTIPLIERS.keys())

    for field in fields:
        if field in data:
            setattr(record, field, _coerce_field_value(field, data[field]))
