# -*- coding: utf-8 -*-
"""
Servicio de modificaciones de arqueos.

Reglas clave:
- Solo aplica a días anteriores (mismo día = UPDATE directo en arqueos.service).
- Periodo de gracia: mes M editable hasta último día hábil del mes M+1.
- Cancelación: reversa del registro original (is_counterpart=True, cancellation).
- Edición: reversa del original + nuevo registro corregido (modification).
- Toda operación dispara recálculo en cascada.
"""

import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.arqueos.models import ArqueoHeader, ArqueoRecord, ArqueoStatus, CounterpartType
from app.arqueos.validators import validate_record, is_row_empty
from app.arqueos.service import (
    recalculate_cascade,
    _record_snapshot,
    get_denomination_inventory,
    validate_denomination_balance,
    DENOMINATION_FIELDS as RECORD_DENOMINATION_FIELDS,
)
from app.catalogs.service import get_last_business_day_of_month
from app.modifications.models import ArqueoModification, ModificationType
from app.common.exceptions import NotFoundError, ForbiddenError, BusinessRuleError
from app.common.background import fire_and_forget
from app.common.id_generator import generate_unique_uid
from app.audit.service import log_action
import asyncio

logger = logging.getLogger(__name__)


# ─── Periodo de gracia ────────────────────────────────────────────────────────

async def get_grace_deadline(db: AsyncSession, arqueo_date: date) -> date:
    """
    Calcula el último día hábil del mes siguiente a arqueo_date.
    Usa el catálogo de holidays para excluir días inhábiles.
    """
    # Mes M+1
    year = arqueo_date.year
    month = arqueo_date.month + 1
    if month > 12:
        month = 1
        year += 1

    return await get_last_business_day_of_month(db, year, month)


async def check_grace_period(db: AsyncSession, arqueo_date: date) -> tuple[bool, date, int | None]:
    """
    Verifica si arqueo_date está dentro del periodo de gracia.
    Retorna (is_within_grace, deadline, days_remaining).
    """
    today = date.today()
    deadline = await get_grace_deadline(db, arqueo_date)
    is_within = today <= deadline
    days_remaining = (deadline - today).days if is_within else None
    return is_within, deadline, days_remaining


def _coerce_int_or_none(value: Any) -> int | None:
    """Convierte valores del payload (que pueden venir como string) a int o None."""
    if value is None or value == "" or value == 0 or value == "0":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _coerce_int(value: Any) -> int:
    """Convierte a int. Lanza BusinessRuleError si no se puede."""
    try:
        return int(value)
    except (ValueError, TypeError):
        raise BusinessRuleError(f"Valor entero inválido: {value!r}")


def _coerce_date(value: Any, fallback: date) -> date:
    """Convierte string ISO 'YYYY-MM-DD' a date; usa fallback si vacío/inválido."""
    if isinstance(value, date):
        return value
    if value is None or value == "":
        return fallback
    try:
        return date.fromisoformat(str(value)[:10])
    except (ValueError, TypeError):
        return fallback


async def _validate_cascade_intraday(
    db: AsyncSession,
    vault_id: int,
    from_date: date,
) -> None:
    """
    Recorre todos los headers publicados/locked de la bóveda con
    `arqueo_date > from_date` y simula intra-day por cada uno.

    Se ejecuta DESPUÉS de aplicar la modificación (con flush hecho) para
    detectar si los días posteriores quedaron con denominaciones negativas
    como consecuencia. Si se encuentra algún día roto, lanza
    `BusinessRuleError` con el día y la denominación; el caller debe estar
    aún DENTRO de la transacción (sin commit) para que el rollback descarte
    todos los cambios.
    """
    headers_result = await db.execute(
        select(ArqueoHeader)
        .where(
            ArqueoHeader.vault_id == vault_id,
            ArqueoHeader.arqueo_date > from_date,
            ArqueoHeader.status != ArqueoStatus.draft,
        )
        .order_by(ArqueoHeader.arqueo_date)
    )
    posterior_headers = list(headers_result.scalars().all())
    if not posterior_headers:
        return

    for header in posterior_headers:
        inventory = await get_denomination_inventory(
            db, vault_id, header.arqueo_date,
        )
        # Bóveda sin migrar (denominaciones iniciales en None) → relajar.
        if any(v is None for v in inventory.values()):
            continue

        # Query fresca de records — evita cache stale del relationship.
        recs_result = await db.execute(
            select(ArqueoRecord)
            .where(
                ArqueoRecord.arqueo_header_id == header.id,
                ArqueoRecord.is_active == True,
                ArqueoRecord.is_counterpart == False,
            )
            .order_by(ArqueoRecord.id)
        )
        records = list(recs_result.scalars().all())
        if not records:
            continue

        records_data = []
        for r in records:
            d: dict[str, Any] = {
                "entries": Decimal(str(r.entries or 0)),
                "withdrawals": Decimal(str(r.withdrawals or 0)),
            }
            for f in RECORD_DENOMINATION_FIELDS:
                d[f] = Decimal(str(getattr(r, f) or 0))
            records_data.append(d)

        issues = validate_denomination_balance(
            inventory, records_data, intraday=True,
        )
        if issues:
            row = issues[0].get("row")
            details = ", ".join(
                f"{i['denomination']} (disponible ${i['available']}, faltan ${i['deficit']})"
                for i in issues
            )
            prefix = f"fila {row}: " if row else ""
            raise BusinessRuleError(
                f"Esta modificación rompería el inventario el "
                f"{header.arqueo_date.strftime('%d %b %Y')} — "
                f"{prefix}{details}. Corrige primero ese día (o los "
                f"siguientes en orden cronológico) antes de aplicar este "
                f"cambio."
            )


async def _validate_inventory_after_change(
    db: AsyncSession,
    vault_id: int,
    arqueo_date: date,
    header_id: int,
    excluded_record_id: int | None,
    extra_record: dict[str, Any] | None,
) -> None:
    """
    Valida que tras la modificación propuesta:
    - Si se cancela un record (excluded_record_id != None, extra=None): se simula
      excluir ese record del header del día.
    - Si se agrega/edita: se simula su efecto en el header del día.

    Lanza BusinessRuleError si alguna denominación queda negativa.
    """
    inventory_start = await get_denomination_inventory(db, vault_id, arqueo_date)
    if any(v is None for v in inventory_start.values()):
        # Bóveda sin migrar: se relaja la validación
        return

    # Cargar registros activos no-counterpart del header (excluyendo el editado/cancelado)
    # Orden por id = orden de captura.
    rows = await db.execute(
        select(ArqueoRecord)
        .where(
            ArqueoRecord.arqueo_header_id == header_id,
            ArqueoRecord.is_active == True,
            ArqueoRecord.is_counterpart == False,
        )
        .order_by(ArqueoRecord.id)
    )
    current_records = [
        r for r in rows.scalars().all()
        if excluded_record_id is None or r.id != excluded_record_id
    ]

    # En edit: el extra_record reemplaza al original en su MISMA posición
    # En add: el extra_record va al final
    proposed: list = list(current_records)
    if extra_record is not None:
        if excluded_record_id is not None:
            # Edit: insertar en la posición que tenía el original
            # Como ya excluimos el original, necesitamos saber su posición original
            all_rows = await db.execute(
                select(ArqueoRecord)
                .where(
                    ArqueoRecord.arqueo_header_id == header_id,
                    ArqueoRecord.is_active == True,
                    ArqueoRecord.is_counterpart == False,
                )
                .order_by(ArqueoRecord.id)
            )
            all_records = list(all_rows.scalars().all())
            try:
                original_idx = next(
                    i for i, r in enumerate(all_records) if r.id == excluded_record_id
                )
                proposed.insert(original_idx, extra_record)
            except StopIteration:
                proposed.append(extra_record)
        else:
            proposed.append(extra_record)

    issues = validate_denomination_balance(
        inventory_start, proposed, intraday=True,
    )
    if issues:
        row = issues[0].get("row")
        details = ", ".join(
            f"{i['denomination']} (disponible ${i['available']}, faltan ${i['deficit']})"
            for i in issues
        )
        prefix = f"Fila {row}: " if row else ""
        raise BusinessRuleError(
            f"{prefix}la modificación dejaría denominaciones en negativo — {details}."
        )


def _negate_record(record: ArqueoRecord) -> dict[str, Any]:
    """
    Genera los datos de un registro de contrapartida (reversa):
    - entries y withdrawals se intercambian (cancela el efecto original).
    - Denominaciones se copian tal cual.
    """
    entries = Decimal(str(record.entries))
    withdrawals = Decimal(str(record.withdrawals))

    return {
        "voucher": record.voucher,
        "reference": record.reference,
        "sucursal_id": record.sucursal_id,
        "movement_type_id": record.movement_type_id,
        # Invertir flujo para cancelar efecto en saldo
        "entries": str(withdrawals),
        "withdrawals": str(entries),
        # Copiar denominaciones (representan el efectivo físico)
        "bill_1000": str(record.bill_1000),
        "bill_500": str(record.bill_500),
        "bill_200": str(record.bill_200),
        "bill_100": str(record.bill_100),
        "bill_50": str(record.bill_50),
        "bill_20": str(record.bill_20),
        "coin_100": str(record.coin_100),
        "coin_50": str(record.coin_50),
        "coin_20": str(record.coin_20),
        "coin_10": str(record.coin_10),
        "coin_5": str(record.coin_5),
        "coin_2": str(record.coin_2),
        "coin_1": str(record.coin_1),
        "coin_050": str(record.coin_050),
        "coin_020": str(record.coin_020),
        "coin_010": str(record.coin_010),
        "record_date": record.record_date,
    }


async def _create_counterpart_record(
    db: AsyncSession,
    original: ArqueoRecord,
    counterpart_type: CounterpartType,
    user_id: int,
) -> ArqueoRecord:
    """Crea el registro de contrapartida (reversa)."""
    uid = await generate_unique_uid(db, ArqueoRecord, "record_uid")
    negate_data = _negate_record(original)

    counterpart = ArqueoRecord(
        record_uid=uid,
        arqueo_header_id=original.arqueo_header_id,
        created_by=user_id,
        is_counterpart=True,
        counterpart_type=counterpart_type,
        original_record_uid=original.record_uid,
        **{k: v for k, v in negate_data.items()},
    )
    db.add(counterpart)
    await db.flush()
    return counterpart


# ─── Operaciones de modificación ─────────────────────────────────────────────

async def cancel_record(
    db: AsyncSession,
    record_uid: str,
    user_id: int,
    reason_id: int,
    reason_detail: str | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> ArqueoRecord:
    """
    Cancela un registro de arqueo (días anteriores).
    1. Verifica periodo de gracia.
    2. Marca el original como inactivo.
    3. Crea registro de contrapartida (cancellation).
    4. Registra en arqueo_modifications.
    5. Dispara recálculo en cascada.
    """
    # Obtener registro original
    result = await db.execute(
        select(ArqueoRecord).where(
            ArqueoRecord.record_uid == record_uid,
            ArqueoRecord.is_active == True,
            ArqueoRecord.is_counterpart == False,
        )
    )
    original = result.scalar_one_or_none()
    if not original:
        raise NotFoundError("Registro de arqueo")

    if original.is_counterpart:
        raise BusinessRuleError("Los registros de contrapartida no son editables.")

    # Obtener header
    header = await db.get(ArqueoHeader, original.arqueo_header_id)
    if not header:
        raise NotFoundError("Arqueo")

    if header.status == ArqueoStatus.locked:
        raise BusinessRuleError("El arqueo está bloqueado y no puede modificarse.")

    # Verificar periodo de gracia
    is_within, deadline, days_remaining = await check_grace_period(db, header.arqueo_date)
    if not is_within:
        raise BusinessRuleError(
            f"El periodo de gracia para este arqueo vence el {deadline}. "
            "No se pueden realizar más modificaciones."
        )

    # Validar inventario tras la cancelación (sólo afecta si el original era entry)
    await _validate_inventory_after_change(
        db,
        vault_id=header.vault_id,
        arqueo_date=header.arqueo_date,
        header_id=header.id,
        excluded_record_id=original.id,
        extra_record=None,
    )

    snap_before = _record_snapshot(original)

    # Desactivar original
    original.is_active = False

    # Crear contrapartida de cancelación
    counterpart = await _create_counterpart_record(
        db, original, CounterpartType.cancellation, user_id
    )

    # Log de modificación
    mod = ArqueoModification(
        arqueo_header_id=header.id,
        arqueo_record_id=original.id,
        modification_type=ModificationType.delete,
        reason_id=reason_id,
        reason_detail=reason_detail,
        previous_data=snap_before,
        new_data=None,
        created_by=user_id,
    )
    db.add(mod)

    await log_action(
        db,
        user_id=user_id,
        action="cancel_record",
        entity_type="arqueo_record",
        entity_id=original.id,
        old_values=snap_before,
        new_values={"cancelled_by": user_id, "counterpart_uid": counterpart.record_uid},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    # Validación cascada: tras flush, simulamos intra-day en cada día
    # posterior. Si esta cancelación dejara denominaciones negativas en
    # algún día siguiente, se levanta BusinessRuleError y la transacción
    # se descarta (no llega al commit).
    await db.flush()
    await _validate_cascade_intraday(db, header.vault_id, header.arqueo_date)

    await db.commit()
    await db.refresh(counterpart)

    # Cascada asíncrona — solo recalcula totales, ya validado arriba.
    fire_and_forget(
        _cascade_task(header.vault_id, header.arqueo_date),
        name=f"cascade-modification-{header.vault_id}",
    )

    return counterpart


async def edit_record(
    db: AsyncSession,
    record_uid: str,
    new_data: dict[str, Any],
    user_id: int,
    reason_id: int,
    reason_detail: str | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> ArqueoRecord:
    """
    Edita un registro de arqueo (días anteriores).
    1. Verifica periodo de gracia.
    2. Valida los nuevos datos.
    3. Marca el original como inactivo.
    4. Crea registro de contrapartida (modification) = reversa del original.
    5. Crea nuevo registro con los datos corregidos.
    6. Registra en arqueo_modifications.
    7. Dispara recálculo en cascada.
    """
    # Obtener registro original
    result = await db.execute(
        select(ArqueoRecord).where(
            ArqueoRecord.record_uid == record_uid,
            ArqueoRecord.is_active == True,
            ArqueoRecord.is_counterpart == False,
        )
    )
    original = result.scalar_one_or_none()
    if not original:
        raise NotFoundError("Registro de arqueo")

    if original.is_counterpart:
        raise BusinessRuleError("Los registros de contrapartida no son editables.")

    header = await db.get(ArqueoHeader, original.arqueo_header_id)
    if not header:
        raise NotFoundError("Arqueo")

    if header.status == ArqueoStatus.locked:
        raise BusinessRuleError("El arqueo está bloqueado y no puede modificarse.")

    # Verificar periodo de gracia
    is_within, deadline, _ = await check_grace_period(db, header.arqueo_date)
    if not is_within:
        raise BusinessRuleError(
            f"El periodo de gracia para este arqueo vence el {deadline}. "
            "No se pueden realizar más modificaciones."
        )

    # Validar nuevos datos
    validate_record(new_data)

    # Validar inventario tras editar (excluir original, agregar new_data)
    await _validate_inventory_after_change(
        db,
        vault_id=header.vault_id,
        arqueo_date=header.arqueo_date,
        header_id=header.id,
        excluded_record_id=original.id,
        extra_record=new_data,
    )

    snap_before = _record_snapshot(original)

    # Desactivar original
    original.is_active = False

    # Crear contrapartida de modificación (reversa del original)
    await _create_counterpart_record(
        db, original, CounterpartType.modification, user_id
    )

    # Crear registro corregido
    new_uid = await generate_unique_uid(db, ArqueoRecord, "record_uid")
    denomination_fields = [
        "bill_1000", "bill_500", "bill_200", "bill_100", "bill_50", "bill_20",
        "coin_100", "coin_50", "coin_20", "coin_10", "coin_5", "coin_2",
        "coin_1", "coin_050", "coin_020", "coin_010",
    ]
    corrected = ArqueoRecord(
        record_uid=new_uid,
        arqueo_header_id=original.arqueo_header_id,
        created_by=user_id,
        is_counterpart=False,
        counterpart_type=None,
        original_record_uid=original.record_uid,
        voucher=new_data.get("voucher", original.voucher),
        reference=new_data.get("reference", original.reference),
        sucursal_id=(
            _coerce_int_or_none(new_data.get("sucursal_id"))
            if "sucursal_id" in new_data
            else original.sucursal_id
        ),
        movement_type_id=(
            _coerce_int(new_data.get("movement_type_id"))
            if new_data.get("movement_type_id")
            else original.movement_type_id
        ),
        entries=new_data.get("entries", "0") or "0",
        withdrawals=new_data.get("withdrawals", "0") or "0",
        record_date=_coerce_date(new_data.get("record_date"), original.record_date),
        **{f: new_data.get(f) or 0 for f in denomination_fields},
    )
    db.add(corrected)
    await db.flush()

    snap_after = _record_snapshot(corrected)

    # Log de modificación
    mod = ArqueoModification(
        arqueo_header_id=header.id,
        arqueo_record_id=original.id,
        modification_type=ModificationType.edit,
        reason_id=reason_id,
        reason_detail=reason_detail,
        previous_data=snap_before,
        new_data=snap_after,
        created_by=user_id,
    )
    db.add(mod)

    await log_action(
        db,
        user_id=user_id,
        action="edit_record",
        entity_type="arqueo_record",
        entity_id=original.id,
        old_values=snap_before,
        new_values=snap_after,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    # Validación cascada (ver _validate_cascade_intraday).
    await db.flush()
    await _validate_cascade_intraday(db, header.vault_id, header.arqueo_date)

    await db.commit()
    await db.refresh(corrected)

    fire_and_forget(
        _cascade_task(header.vault_id, header.arqueo_date),
        name=f"cascade-modification-{header.vault_id}",
    )

    return corrected


async def add_record(
    db: AsyncSession,
    header_id: int,
    record_data: dict[str, Any],
    user_id: int,
    reason_id: int,
    reason_detail: str | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> ArqueoRecord:
    """
    Añade un nuevo registro a un arqueo publicado (días anteriores).
    Requiere que el arqueo esté dentro del periodo de gracia.
    """
    header = await db.get(ArqueoHeader, header_id)
    if not header:
        raise NotFoundError("Arqueo")

    if header.status == ArqueoStatus.locked:
        raise BusinessRuleError("El arqueo está bloqueado y no puede modificarse.")

    if header.status != ArqueoStatus.published:
        raise BusinessRuleError(
            "Solo se pueden agregar registros a arqueos publicados."
        )

    # Verificar periodo de gracia
    is_within, deadline, _ = await check_grace_period(db, header.arqueo_date)
    if not is_within:
        raise BusinessRuleError(
            f"El periodo de gracia para este arqueo vence el {deadline}. "
            "No se pueden realizar más modificaciones."
        )

    # Validar datos del nuevo registro
    validate_record(record_data)

    # Validar inventario tras agregar
    await _validate_inventory_after_change(
        db,
        vault_id=header.vault_id,
        arqueo_date=header.arqueo_date,
        header_id=header.id,
        excluded_record_id=None,
        extra_record=record_data,
    )

    new_uid = await generate_unique_uid(db, ArqueoRecord, "record_uid")
    denomination_fields = [
        "bill_1000", "bill_500", "bill_200", "bill_100", "bill_50", "bill_20",
        "coin_100", "coin_50", "coin_20", "coin_10", "coin_5", "coin_2",
        "coin_1", "coin_050", "coin_020", "coin_010",
    ]

    new_record = ArqueoRecord(
        record_uid=new_uid,
        arqueo_header_id=header_id,
        created_by=user_id,
        is_counterpart=False,
        voucher=record_data.get("voucher", ""),
        reference=record_data.get("reference", ""),
        sucursal_id=_coerce_int_or_none(record_data.get("sucursal_id")),
        movement_type_id=_coerce_int(record_data.get("movement_type_id")),
        entries=record_data.get("entries", "0") or "0",
        withdrawals=record_data.get("withdrawals", "0") or "0",
        record_date=_coerce_date(record_data.get("record_date"), header.arqueo_date),
        **{f: record_data.get(f) or 0 for f in denomination_fields},
    )
    db.add(new_record)
    await db.flush()

    snap = _record_snapshot(new_record)

    mod = ArqueoModification(
        arqueo_header_id=header.id,
        arqueo_record_id=new_record.id,
        modification_type=ModificationType.add,
        reason_id=reason_id,
        reason_detail=reason_detail,
        previous_data=None,
        new_data=snap,
        created_by=user_id,
    )
    db.add(mod)

    await log_action(
        db,
        user_id=user_id,
        action="add_record",
        entity_type="arqueo_record",
        entity_id=new_record.id,
        old_values=None,
        new_values=snap,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    # Validación cascada (ver _validate_cascade_intraday).
    await db.flush()
    await _validate_cascade_intraday(db, header.vault_id, header.arqueo_date)

    await db.commit()
    await db.refresh(new_record)

    fire_and_forget(
        _cascade_task(header.vault_id, header.arqueo_date),
        name=f"cascade-modification-{header.vault_id}",
    )

    return new_record


async def list_modifications(
    db: AsyncSession,
    header_id: int,
) -> list[ArqueoModification]:
    """Retorna el historial de modificaciones de un arqueo header."""
    result = await db.execute(
        select(ArqueoModification)
        .where(ArqueoModification.arqueo_header_id == header_id)
        .order_by(ArqueoModification.created_at.desc())
    )
    return list(result.scalars().all())


async def list_modifiable_headers(
    db: AsyncSession,
    user_id: int,
) -> list[dict]:
    """
    Retorna los arqueos publicados de las bóvedas asignadas al ETV
    que aún están dentro del periodo de gracia.

    Si dentro del periodo de gracia hay días sin header (la bóveda nunca abrió la
    pantalla ese día), se crean en blanco como auto_published para que el ETV
    pueda agregar movimientos vía el módulo de modificaciones.
    """
    from datetime import timedelta
    from app.users.models import UserVaultAssignment
    from app.vaults.models import Vault
    from app.arqueos.service import ensure_blank_headers_for_range

    # Obtener vault_ids asignados
    assignment_result = await db.execute(
        select(UserVaultAssignment.vault_id).where(
            UserVaultAssignment.user_id == user_id,
            UserVaultAssignment.is_active == True,
        )
    )
    vault_ids = [r[0] for r in assignment_result.all()]

    if not vault_ids:
        return []

    today = date.today()

    # Rango del periodo de gracia: arqueos del mes anterior y de este mes hasta ayer.
    # Si hoy es 2026-04-27, el rango es 2026-03-01 .. 2026-04-26.
    first_of_this_month = today.replace(day=1)
    grace_start = (first_of_this_month - timedelta(days=1)).replace(day=1)
    grace_end = today - timedelta(days=1)

    # Asegurar headers en blanco para los días faltantes en el rango (por bóveda)
    for vid in vault_ids:
        try:
            await ensure_blank_headers_for_range(
                db, vid, grace_start, grace_end, created_by=user_id
            )
        except Exception as exc:
            logger.error("ensure_blank_headers falló vault_id=%d: %s", vid, exc)

    # Obtener headers publicados (no locked) de esas bóvedas, excluyendo hoy
    # (el mismo día se re-publica en lugar de modificar)
    headers_result = await db.execute(
        select(ArqueoHeader)
        .where(
            ArqueoHeader.vault_id.in_(vault_ids),
            ArqueoHeader.status == ArqueoStatus.published,
            ArqueoHeader.arqueo_date < today,
        )
        .order_by(ArqueoHeader.arqueo_date.desc())
    )
    headers = headers_result.scalars().all()

    # Pre-cargar bóvedas para enriquecer con vault_code/vault_name
    vault_result = await db.execute(select(Vault).where(Vault.id.in_(vault_ids)))
    vault_map = {v.id: v for v in vault_result.scalars().all()}

    results = []
    for header in headers:
        try:
            is_within, deadline, days_remaining = await check_grace_period(
                db, header.arqueo_date
            )
            if is_within:
                vault = vault_map.get(header.vault_id)
                results.append({
                    "header_id": header.id,
                    "vault_id": header.vault_id,
                    "vault_code": vault.vault_code if vault else None,
                    "vault_name": vault.vault_name if vault else None,
                    "arqueo_date": str(header.arqueo_date),
                    "status": header.status,
                    "auto_published": header.auto_published,
                    "opening_balance": str(header.opening_balance),
                    "closing_balance": str(header.closing_balance),
                    "grace_deadline": str(deadline),
                    "days_remaining": days_remaining,
                })
        except Exception:
            pass

    return results


async def lock_arqueo(
    db: AsyncSession,
    header_id: int,
    user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> ArqueoHeader:
    """
    Bloquea un arqueo publicado cuyo periodo de gracia ha expirado.
    Solo Admin/Operations pueden forzar el bloqueo.
    El job nocturno usa este servicio para bloquear automáticamente.
    """
    header = await db.get(ArqueoHeader, header_id)
    if not header:
        raise NotFoundError("Arqueo")

    if header.status != ArqueoStatus.published:
        raise BusinessRuleError("Solo se pueden bloquear arqueos publicados.")

    header.status = ArqueoStatus.locked
    header.locked_at = datetime.now(timezone.utc)

    await log_action(
        db,
        user_id=user_id,
        action="lock",
        entity_type="arqueo_header",
        entity_id=header.id,
        new_values={"locked_at": str(header.locked_at)},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    await db.commit()
    await db.refresh(header)
    return header


async def _cascade_task(vault_id: int, from_date: date) -> None:
    """Tarea asíncrona de recálculo en cascada (modificaciones)."""
    from app.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            await recalculate_cascade(db, vault_id, from_date)
            await db.commit()
        except Exception as exc:
            logger.error("Error en cascada (modificación) vault_id=%d: %s", vault_id, exc)
