# -*- coding: utf-8 -*-
"""Servicio de generación de reportes descargables."""

from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.arqueos.models import ArqueoHeader, ArqueoRecord, ArqueoStatus
from app.vaults.models import Vault, Branch
from app.users.models import Company
from app.catalogs.models import MovementType
from app.reports.generators import generate_daily_balances_xlsx, generate_records_xlsx
from app.audit.service import log_action


async def get_daily_balances(
    db: AsyncSession,
    date_from: date | None = None,
    date_to: date | None = None,
    company_id: int | None = None,
    vault_id: int | None = None,
    page: int = 1,
    page_size: int = 100,
) -> tuple[list[dict], int]:
    """Reporte de saldos finales por bóveda/día con filtros."""
    from sqlalchemy import func

    query = (
        select(
            ArqueoHeader,
            Vault.vault_code,
            Vault.vault_name,
            Vault.company_id,
            Company.name.label("company_name"),
        )
        .join(Vault, Vault.id == ArqueoHeader.vault_id)
        .join(Company, Company.id == Vault.company_id)
        .where(ArqueoHeader.status != ArqueoStatus.draft)
    )

    if date_from:
        query = query.where(ArqueoHeader.arqueo_date >= date_from)
    if date_to:
        query = query.where(ArqueoHeader.arqueo_date <= date_to)
    if company_id:
        query = query.where(Vault.company_id == company_id)
    if vault_id:
        query = query.where(ArqueoHeader.vault_id == vault_id)

    # Contar
    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    # Obtener registros con totales
    offset = (page - 1) * page_size
    query = query.order_by(
        ArqueoHeader.arqueo_date.desc(), Vault.vault_code
    ).offset(offset).limit(page_size)

    result = await db.execute(query)
    rows_raw = result.all()

    rows = []
    for header, vault_code, vault_name, comp_id, company_name in rows_raw:
        # Sumar entradas/salidas de los registros activos
        totals_q = (
            select(
                func.coalesce(func.sum(ArqueoRecord.entries), 0),
                func.coalesce(func.sum(ArqueoRecord.withdrawals), 0),
            )
            .where(
                ArqueoRecord.arqueo_header_id == header.id,
                ArqueoRecord.is_active == True,
            )
        )
        totals = (await db.execute(totals_q)).one()

        rows.append({
            "header_id": header.id,
            "date": str(header.arqueo_date),
            "vault_code": vault_code,
            "vault_name": vault_name,
            "company_name": company_name,
            "opening_balance": float(header.opening_balance),
            "closing_balance": float(header.closing_balance),
            "total_entries": float(totals[0]),
            "total_withdrawals": float(totals[1]),
            "status": header.status,
        })

    return rows, total


async def download_daily_balances_xlsx(
    db: AsyncSession,
    date_from: date | None,
    date_to: date | None,
    company_id: int | None,
    vault_id: int | None,
    user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> bytes:
    """Descarga XLSX de saldos finales con auditoría."""
    # Sin paginación para descarga completa
    rows, _ = await get_daily_balances(
        db,
        date_from=date_from,
        date_to=date_to,
        company_id=company_id,
        vault_id=vault_id,
        page=1,
        page_size=10_000,
    )

    filters = {
        "date_from": str(date_from) if date_from else None,
        "date_to": str(date_to) if date_to else None,
        "company_id": company_id,
        "vault_id": vault_id,
    }

    await log_action(
        db,
        user_id=user_id,
        action="download",
        entity_type="report_daily_balances",
        entity_id=None,
        new_values=filters,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()

    return generate_daily_balances_xlsx(rows, date_from, date_to)
