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
from app.arqueos.service import recalculate_cascade, _record_snapshot
from app.modifications.models import ArqueoModification, ModificationType
from app.common.exceptions import NotFoundError, ForbiddenError, BusinessRuleError
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
    from app.catalogs.service import get_last_business_day_of_month
    import calendar

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
        "branch_id": record.branch_id,
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
        "record_date": str(record.record_date),
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

    await db.commit()
    await db.refresh(counterpart)

    # Cascada asíncrona
    asyncio.create_task(_cascade_task(header.vault_id, header.arqueo_date))

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
        branch_id=new_data.get("branch_id", original.branch_id),
        movement_type_id=new_data.get("movement_type_id", original.movement_type_id),
        entries=new_data.get("entries", "0"),
        withdrawals=new_data.get("withdrawals", "0"),
        record_date=new_data.get("record_date", original.record_date),
        **{f: new_data.get(f, 0) for f in denomination_fields},
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

    await db.commit()
    await db.refresh(corrected)

    asyncio.create_task(_cascade_task(header.vault_id, header.arqueo_date))

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
        branch_id=record_data["branch_id"],
        movement_type_id=record_data["movement_type_id"],
        entries=record_data.get("entries", "0"),
        withdrawals=record_data.get("withdrawals", "0"),
        record_date=record_data.get("record_date", header.arqueo_date),
        **{f: record_data.get(f, 0) for f in denomination_fields},
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

    await db.commit()
    await db.refresh(new_record)

    asyncio.create_task(_cascade_task(header.vault_id, header.arqueo_date))

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
    """
    from app.users.models import UserVaultAssignment
    from app.vaults.models import Vault

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

    # Obtener headers publicados (no locked) de esas bóvedas
    headers_result = await db.execute(
        select(ArqueoHeader)
        .where(
            ArqueoHeader.vault_id.in_(vault_ids),
            ArqueoHeader.status == ArqueoStatus.published,
        )
        .order_by(ArqueoHeader.arqueo_date.desc())
    )
    headers = headers_result.scalars().all()

    today = date.today()
    results = []
    for header in headers:
        try:
            is_within, deadline, days_remaining = await check_grace_period(
                db, header.arqueo_date
            )
            if is_within:
                results.append({
                    "header_id": header.id,
                    "vault_id": header.vault_id,
                    "arqueo_date": str(header.arqueo_date),
                    "status": header.status,
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
