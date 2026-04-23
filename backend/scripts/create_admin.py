#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Script para crear el primer usuario admin del sistema.

Uso:
    python scripts/create_admin.py

Variables de entorno requeridas: DATABASE_URL
"""

import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy import select

from app.config import settings
from app.users.models import User, UserRole, UserType
from app.auth.utils import hash_password, validate_password_strength


async def create_admin() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    print("\n=== Crear Usuario Admin ===\n")

    email = input("Email del admin: ").strip()
    full_name = input("Nombre completo: ").strip()

    while True:
        password = input("Contraseña (mín 12 chars, mayúscula, minúscula, número, especial): ").strip()
        errors = validate_password_strength(password)
        if errors:
            print("❌", " | ".join(errors))
        else:
            confirm = input("Confirmar contraseña: ").strip()
            if password != confirm:
                print("❌ Las contraseñas no coinciden.")
            else:
                break

    async with session_factory() as db:
        # Verificar si ya existe
        result = await db.execute(select(User).where(User.email == email))
        if result.scalar_one_or_none():
            print(f"❌ Ya existe un usuario con el email '{email}'.")
            return

        admin = User(
            email=email,
            password_hash=hash_password(password),
            full_name=full_name,
            role=UserRole.admin,
            user_type=UserType.internal,
            is_active=True,
            must_change_password=False,
            mfa_enabled=False,
        )
        db.add(admin)
        await db.commit()
        await db.refresh(admin)

    print(f"\n✅ Admin creado exitosamente.")
    print(f"   ID: {admin.id}")
    print(f"   Email: {admin.email}")
    print(f"   Nombre: {admin.full_name}")
    print(f"   Rol: {admin.role.value}\n")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(create_admin())
