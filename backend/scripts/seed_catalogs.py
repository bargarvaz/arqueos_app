#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script para poblar los catálogos iniciales del sistema.

Uso:
    python scripts/seed_catalogs.py
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


async def seed() -> None:
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from sqlalchemy import select
    from app.config import settings

    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        await _seed_companies(db)
        await _seed_movement_types(db)
        await _seed_modification_reasons(db)
        await _seed_branches(db)
        await db.commit()

    await engine.dispose()
    print("\n✅ Catálogos sembrados exitosamente.\n")


async def _seed_companies(db) -> None:
    """ETVs iniciales."""
    from app.users.models import Company
    from sqlalchemy import select

    companies = ["PanAmericano", "GSI"]
    for name in companies:
        result = await db.execute(select(Company).where(Company.name == name))
        if not result.scalar_one_or_none():
            db.add(Company(name=name))
            print(f"  Empresa: {name}")


async def _seed_movement_types(db) -> None:
    """Tipos de movimiento iniciales."""
    # Importación diferida para evitar circular en módulo catalogs
    from sqlalchemy import text
    entries = [
        ("remanente", "Saldo remanente de la bóveda"),
        ("flotante", "Efectivo en tránsito"),
        ("ingreso", "Ingreso de efectivo"),
        ("traspaso", "Traspaso entre bóvedas"),
        ("retiro", "Retiro de efectivo"),
        ("ajuste", "Ajuste de saldo"),
    ]
    for name, description in entries:
        result = await db.execute(
            text("SELECT id FROM movement_types WHERE name = :name"),
            {"name": name}
        )
        if not result.fetchone():
            await db.execute(
                text(
                    "INSERT INTO movement_types (name, description) VALUES (:name, :description)"
                ),
                {"name": name, "description": description},
            )
            print(f"  Tipo movimiento: {name}")


async def _seed_modification_reasons(db) -> None:
    """Motivos de modificación iniciales."""
    from sqlalchemy import text
    reasons = [
        "Error de captura",
        "Duplicado",
        "Monto incorrecto",
        "Tipo de movimiento incorrecto",
        "Sucursal incorrecta",
        "Comprobante incorrecto",
        "Referencia incorrecta",
        "Otro",
    ]
    for name in reasons:
        result = await db.execute(
            text("SELECT id FROM modification_reasons WHERE name = :name"),
            {"name": name},
        )
        if not result.fetchone():
            await db.execute(
                text("INSERT INTO modification_reasons (name) VALUES (:name)"),
                {"name": name},
            )
            print(f"  Motivo modificación: {name}")


async def _seed_branches(db) -> None:
    """Sucursales de ejemplo."""
    from sqlalchemy import text
    branches = [
        "Centro",
        "Norte",
        "Sur",
        "Oriente",
        "Poniente",
        "Aeropuerto",
        "Plaza Mayor",
    ]
    for name in branches:
        result = await db.execute(
            text("SELECT id FROM branches WHERE name = :name"),
            {"name": name},
        )
        if not result.fetchone():
            await db.execute(
                text("INSERT INTO branches (name) VALUES (:name)"),
                {"name": name},
            )
            print(f"  Sucursal: {name}")


if __name__ == "__main__":
    asyncio.run(seed())
