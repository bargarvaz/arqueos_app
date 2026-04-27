# -*- coding: utf-8 -*-
"""Servicio de métricas del dashboard operativo."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, case

from app.arqueos.models import ArqueoHeader, ArqueoRecord, ArqueoStatus
from app.vaults.models import Vault


async def get_summary(
    db: AsyncSession,
    target_date: date | None = None,
    company_id: int | None = None,
) -> dict[str, Any]:
    """
    Métricas del día:
    - Total bóvedas activas
    - Bóvedas con arqueo publicado
    - Bóvedas sin arqueo
    - Total entradas del día
    - Total salidas del día
    - Bóvedas con saldo negativo
    """
    if target_date is None:
        target_date = date.today()

    # Total bóvedas activas (con filtro opcional de empresa)
    vaults_q = select(func.count(Vault.id)).where(Vault.is_active == True)
    if company_id:
        vaults_q = vaults_q.where(Vault.company_id == company_id)
    total_vaults = (await db.execute(vaults_q)).scalar_one()

    # Headers del día
    headers_q = (
        select(ArqueoHeader)
        .join(Vault, Vault.id == ArqueoHeader.vault_id)
        .where(
            ArqueoHeader.arqueo_date == target_date,
            ArqueoHeader.status != ArqueoStatus.draft,
            Vault.is_active == True,
        )
    )
    if company_id:
        headers_q = headers_q.where(Vault.company_id == company_id)

    headers_result = await db.execute(headers_q)
    headers = headers_result.scalars().all()

    published_count = len(headers)
    missing_count = max(0, total_vaults - published_count)
    negative_count = sum(
        1 for h in headers if Decimal(str(h.closing_balance)) < 0
    )

    # Totales de entradas/salidas del día
    entries_q = (
        select(func.coalesce(func.sum(ArqueoRecord.entries), 0))
        .join(ArqueoHeader, ArqueoHeader.id == ArqueoRecord.arqueo_header_id)
        .join(Vault, Vault.id == ArqueoHeader.vault_id)
        .where(
            ArqueoHeader.arqueo_date == target_date,
            ArqueoHeader.status != ArqueoStatus.draft,
            ArqueoRecord.is_active == True,
            Vault.is_active == True,
        )
    )
    withdrawals_q = entries_q.with_only_columns(
        func.coalesce(func.sum(ArqueoRecord.withdrawals), 0)
    )

    if company_id:
        entries_q = entries_q.where(Vault.company_id == company_id)
        withdrawals_q = withdrawals_q.where(Vault.company_id == company_id)

    total_entries = (await db.execute(entries_q)).scalar_one()
    total_withdrawals = (await db.execute(withdrawals_q)).scalar_one()

    return {
        "date": str(target_date),
        "total_vaults": total_vaults,
        "published_count": published_count,
        "missing_count": missing_count,
        "negative_balance_count": negative_count,
        "total_entries": str(total_entries),
        "total_withdrawals": str(total_withdrawals),
    }


async def get_missing_vaults(
    db: AsyncSession,
    target_date: date | None = None,
    company_id: int | None = None,
) -> list[dict]:
    """Lista de bóvedas activas sin arqueo en target_date."""
    if target_date is None:
        target_date = date.today()

    vaults_q = select(Vault).where(Vault.is_active == True)
    if company_id:
        vaults_q = vaults_q.where(Vault.company_id == company_id)

    vaults_result = await db.execute(vaults_q)
    all_vaults = vaults_result.scalars().all()

    # IDs de bóvedas que YA tienen arqueo
    submitted_q = (
        select(ArqueoHeader.vault_id)
        .where(
            ArqueoHeader.arqueo_date == target_date,
            ArqueoHeader.status != ArqueoStatus.draft,
        )
    )
    submitted_result = await db.execute(submitted_q)
    submitted_ids = {r[0] for r in submitted_result.all()}

    missing = []
    for vault in all_vaults:
        if vault.id not in submitted_ids:
            missing.append({
                "vault_id": vault.id,
                "vault_code": vault.vault_code,
                "vault_name": vault.vault_name,
                "company_id": vault.company_id,
            })

    return missing


async def get_weekly_trend(
    db: AsyncSession,
    company_id: int | None = None,
) -> list[dict]:
    """
    Tendencia de 7 días: por cada día, total entradas, salidas y arqueos publicados.
    """
    today = date.today()
    results = []

    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        summary = await get_summary(db, target_date=day, company_id=company_id)
        results.append({
            "date": str(day),
            "published_count": summary["published_count"],
            "total_entries": summary["total_entries"],
            "total_withdrawals": summary["total_withdrawals"],
        })

    return results


async def get_denomination_distribution(
    db: AsyncSession,
    target_date: date | None = None,
    company_id: int | None = None,
) -> list[dict]:
    """
    Composición de la bóveda por denominación al cierre de target_date.

    Para cada denominación, suma las entradas y resta las salidas de TODOS los
    registros publicados (no draft) hasta target_date (inclusive). Esto refleja
    el dinero que hay físicamente EN las bóvedas activas, no el flujo del día.

    El check_constraint del modelo garantiza que entries y withdrawals son
    mutuamente excluyentes, por lo que `entries > 0` distingue entradas de salidas.
    """
    if target_date is None:
        target_date = date.today()

    denomination_fields = [
        ("bill_1000", "$1,000"),
        ("bill_500", "$500"),
        ("bill_200", "$200"),
        ("bill_100", "$100"),
        ("bill_50", "$50"),
        ("bill_20", "$20"),
        ("coin_100", "$100 M"),
        ("coin_50", "$50 M"),
        ("coin_20", "$20 M"),
        ("coin_10", "$10 M"),
        ("coin_5", "$5 M"),
        ("coin_2", "$2 M"),
        ("coin_1", "$1 M"),
        ("coin_050", "$0.50"),
        ("coin_020", "$0.20"),
        ("coin_010", "$0.10"),
    ]

    distribution = []
    for field_name, label in denomination_fields:
        col = getattr(ArqueoRecord, field_name)
        # Entrada = +col, Salida = -col
        net = case((ArqueoRecord.entries > 0, col), else_=-col)
        q = (
            select(func.coalesce(func.sum(net), 0))
            .join(ArqueoHeader, ArqueoHeader.id == ArqueoRecord.arqueo_header_id)
            .join(Vault, Vault.id == ArqueoHeader.vault_id)
            .where(
                ArqueoHeader.arqueo_date <= target_date,
                ArqueoHeader.status != ArqueoStatus.draft,
                ArqueoRecord.is_active == True,
                ArqueoRecord.is_counterpart == False,
                Vault.is_active == True,
            )
        )
        if company_id:
            q = q.where(Vault.company_id == company_id)

        total = (await db.execute(q)).scalar_one()
        # No mostrar denominaciones negativas en la gráfica (puede pasar en datos
        # de prueba con salidas sin entradas previas registradas en denominaciones).
        if total < 0:
            total = 0
        distribution.append({"denomination": label, "total": str(total)})

    return distribution
