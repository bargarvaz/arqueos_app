# -*- coding: utf-8 -*-
"""
Servicio del explorador de arqueos para usuarios internos.
Soporta filtros combinados y descarga XLSX con auditoría.
"""

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func

from app.arqueos.models import ArqueoHeader, ArqueoRecord, ArqueoStatus
from app.vaults.models import Vault, Branch
from app.users.models import Company
from app.catalogs.models import MovementType
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
            Branch.name.label("branch_name"),
            MovementType.name.label("movement_type_name"),
        )
        .join(ArqueoHeader, ArqueoHeader.id == ArqueoRecord.arqueo_header_id)
        .join(Vault, Vault.id == ArqueoHeader.vault_id)
        .join(Company, Company.id == Vault.company_id)
        .outerjoin(Branch, Branch.id == ArqueoRecord.branch_id)
        .outerjoin(MovementType, MovementType.id == ArqueoRecord.movement_type_id)
        .where(ArqueoRecord.is_active == True)
    )

    if not include_counterparts:
        query = query.where(ArqueoRecord.is_counterpart == False)

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

    offset = (page - 1) * page_size
    query = query.order_by(
        ArqueoHeader.arqueo_date.desc(), ArqueoRecord.id
    ).offset(offset).limit(page_size)

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
    **filters,
) -> bytes:
    """Descarga XLSX de registros con auditoría de la acción download."""
    from app.reports.generators import generate_records_xlsx

    rows, _ = await explore_records(db, page=1, page_size=10_000, **filters)

    filters_clean = {k: v for k, v in filters.items() if v is not None}

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
