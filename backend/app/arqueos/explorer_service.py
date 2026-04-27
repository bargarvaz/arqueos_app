# -*- coding: utf-8 -*-
"""
Servicio del explorador de arqueos para usuarios internos.
Soporta filtros combinados y descarga XLSX con auditoría.
"""

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func

from app.arqueos.models import ArqueoHeader, ArqueoRecord, ArqueoStatus
from app.vaults.models import Vault
from app.users.models import Company
from app.catalogs.models import MovementType, Sucursal
from app.audit.service import log_action


async def explore_records(
    db: AsyncSession,
    company_id: int | None = None,
    vault_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    movement_type_id: int | None = None,
    status: str | None = None,
    search: str | None = None,
    include_counterparts: bool = True,
    page: int = 1,
    page_size: int = 25,
    allowed_vault_ids: list[int] | None = None,
) -> tuple[list[dict], int]:
    """
    Explorador avanzado de registros de arqueo con JOINs para
    mostrar empresa ETV, bóveda, tipo de movimiento y sucursal.
    """
    query = (
        select(
            ArqueoRecord,
            ArqueoHeader.arqueo_date,
            ArqueoHeader.status.label("header_status"),
            ArqueoHeader.vault_id,
            Vault.vault_code,
            Vault.vault_name,
            Company.name.label("company_name"),
            Sucursal.name.label("branch_name"),
            MovementType.name.label("movement_type_name"),
        )
        .join(ArqueoHeader, ArqueoHeader.id == ArqueoRecord.arqueo_header_id)
        .join(Vault, Vault.id == ArqueoHeader.vault_id)
        .join(Company, Company.id == Vault.company_id)
        .outerjoin(Sucursal, Sucursal.id == ArqueoRecord.sucursal_id)
        .outerjoin(MovementType, MovementType.id == ArqueoRecord.movement_type_id)
        .where(ArqueoRecord.is_active == True)
    )

    if not include_counterparts:
        query = query.where(ArqueoRecord.is_counterpart == False)

    if allowed_vault_ids is not None:
        if not allowed_vault_ids:
            # ETV sin asignaciones: no debe ver nada
            return [], 0
        query = query.where(ArqueoHeader.vault_id.in_(allowed_vault_ids))

    if company_id:
        query = query.where(Vault.company_id == company_id)
    if vault_id:
        query = query.where(ArqueoHeader.vault_id == vault_id)
    if date_from:
        query = query.where(ArqueoHeader.arqueo_date >= date_from)
    if date_to:
        query = query.where(ArqueoHeader.arqueo_date <= date_to)
    if movement_type_id:
        query = query.where(ArqueoRecord.movement_type_id == movement_type_id)
    if status:
        query = query.where(ArqueoHeader.status == status)
    if search:
        search_term = f"%{search}%"
        query = query.where(
            or_(
                ArqueoRecord.voucher.ilike(search_term),
                ArqueoRecord.reference.ilike(search_term),
                Vault.vault_code.ilike(search_term),
                Vault.vault_name.ilike(search_term),
            )
        )

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    effective_limit = page_size if page_size > 0 else 10_000
    offset = (page - 1) * page_size if page_size > 0 else 0
    query = query.order_by(
        ArqueoHeader.arqueo_date.desc(), ArqueoRecord.id
    ).offset(offset).limit(effective_limit)

    result = await db.execute(query)
    rows_raw = result.all()

    rows = []
    for (
        record, arqueo_date, header_status, vault_id_val,
        vault_code, vault_name, company_name, branch_name, movement_type_name,
    ) in rows_raw:
        rows.append({
            "record_id": record.id,
            "record_uid": record.record_uid,
            "arqueo_date": str(arqueo_date),
            "vault_id": vault_id_val,
            "vault_code": vault_code,
            "vault_name": vault_name,
            "company_name": company_name,
            "voucher": record.voucher,
            "reference": record.reference,
            "branch_name": branch_name or "",
            "movement_type_name": movement_type_name or "",
            "entries": float(record.entries),
            "withdrawals": float(record.withdrawals),
            "bill_1000": float(record.bill_1000),
            "bill_500": float(record.bill_500),
            "bill_200": float(record.bill_200),
            "bill_100": float(record.bill_100),
            "bill_50": float(record.bill_50),
            "bill_20": float(record.bill_20),
            "coin_100": float(record.coin_100),
            "coin_50": float(record.coin_50),
            "coin_20": float(record.coin_20),
            "coin_10": float(record.coin_10),
            "coin_5": float(record.coin_5),
            "coin_2": float(record.coin_2),
            "coin_1": float(record.coin_1),
            "coin_050": float(record.coin_050),
            "coin_020": float(record.coin_020),
            "coin_010": float(record.coin_010),
            "record_date": str(record.record_date),
            "header_status": header_status,
            "is_counterpart": record.is_counterpart,
            "counterpart_type": record.counterpart_type,
            "original_record_uid": record.original_record_uid,
        })

    return rows, total


async def download_records_xlsx(
    db: AsyncSession,
    user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
    allowed_vault_ids: list[int] | None = None,
    **filters,
) -> bytes:
    """Descarga XLSX de registros con auditoría de la acción download."""
    from app.reports.generators import generate_records_xlsx

    rows, _ = await explore_records(
        db, page=1, page_size=10_000,
        allowed_vault_ids=allowed_vault_ids, **filters,
    )

    filters_clean = {
        k: str(v) if isinstance(v, date) else v
        for k, v in filters.items()
        if v is not None
    }

    await log_action(
        db,
        user_id=user_id,
        action="download",
        entity_type="report_records",
        entity_id=None,
        new_values=filters_clean,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()

    return generate_records_xlsx(rows, filters_clean)


async def get_vault_day_balances(
    db: AsyncSession,
    target_date: date,
    allowed_vault_ids: list[int] | None = None,
) -> list[dict]:
    """
    Retorna opening_balance, closing_balance y status para cada bóveda activa
    en una fecha dada. Si no hay header ese día, opening = último closing anterior
    (o initial_balance si es la primera vez).

    Si `allowed_vault_ids` se pasa (ETV), solo devuelve esas bóvedas.
    """
    vaults_q = select(Vault).where(Vault.is_active == True)
    if allowed_vault_ids is not None:
        if not allowed_vault_ids:
            return []
        vaults_q = vaults_q.where(Vault.id.in_(allowed_vault_ids))
    vaults_result = await db.execute(vaults_q.order_by(Vault.vault_code))
    vaults = list(vaults_result.scalars().all())
    if not vaults:
        return []

    vault_ids = [v.id for v in vaults]

    # Headers del día solicitado
    headers_result = await db.execute(
        select(ArqueoHeader).where(
            ArqueoHeader.vault_id.in_(vault_ids),
            ArqueoHeader.arqueo_date == target_date,
        )
    )
    today_headers: dict[int, ArqueoHeader] = {
        h.vault_id: h for h in headers_result.scalars().all()
    }

    # Para bóvedas sin header hoy: buscar el closing_balance del día más reciente anterior
    vaults_without = [vid for vid in vault_ids if vid not in today_headers]
    last_closing_map: dict[int, Decimal] = {}
    if vaults_without:
        subq = (
            select(
                ArqueoHeader.vault_id,
                func.max(ArqueoHeader.arqueo_date).label("last_date"),
            )
            .where(
                ArqueoHeader.vault_id.in_(vaults_without),
                ArqueoHeader.arqueo_date < target_date,
            )
            .group_by(ArqueoHeader.vault_id)
            .subquery()
        )
        last_result = await db.execute(
            select(ArqueoHeader.vault_id, ArqueoHeader.closing_balance).join(
                subq,
                and_(
                    ArqueoHeader.vault_id == subq.c.vault_id,
                    ArqueoHeader.arqueo_date == subq.c.last_date,
                ),
            )
        )
        for vid, cb in last_result.all():
            last_closing_map[vid] = cb

    rows = []
    for v in vaults:
        h = today_headers.get(v.id)
        if h:
            opening = float(h.opening_balance)
            closing = float(h.closing_balance)
            status: str | None = h.status
        else:
            prior = last_closing_map.get(v.id)
            opening = float(prior) if prior is not None else float(v.initial_balance)
            closing = opening
            status = None
        rows.append({
            "vault_id": v.id,
            "vault_code": v.vault_code,
            "vault_name": v.vault_name,
            "opening_balance": opening,
            "closing_balance": closing,
            "status": status,
        })
    return rows
