# -*- coding: utf-8 -*-
"""Generador de IDs alfanuméricos únicos de 6 caracteres (A-Z, 0-9)."""

import secrets
import string

ALPHABET = string.ascii_uppercase + string.digits  # A-Z + 0-9
UID_LENGTH = 6


def generate_uid() -> str:
    """Genera un UID alfanumérico de 6 caracteres criptográficamente seguro."""
    return "".join(secrets.choice(ALPHABET) for _ in range(UID_LENGTH))


async def generate_unique_uid(db, model_class, field_name: str = "record_uid") -> str:
    """
    Genera un UID garantizando que no exista colisión en la BD.
    Intenta hasta 10 veces antes de lanzar excepción.
    """
    from sqlalchemy import select

    for _ in range(10):
        uid = generate_uid()
        column = getattr(model_class, field_name)
        result = await db.execute(select(model_class).where(column == uid))
        if result.scalar_one_or_none() is None:
            return uid

    raise RuntimeError("No se pudo generar un UID único después de 10 intentos.")
