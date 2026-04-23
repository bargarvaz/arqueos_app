# -*- coding: utf-8 -*-
"""Utilidades de autenticación: JWT, hashing de contraseñas, OTP."""

import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.config import settings

# ─── Hashing de contraseñas ──────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    """Genera hash bcrypt de la contraseña."""
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    """Verifica contraseña contra su hash."""
    return pwd_context.verify(plain, hashed)


# ─── JWT ─────────────────────────────────────────────────────────────────────

def create_access_token(user_id: int, extra_claims: dict[str, Any] | None = None) -> str:
    """Crea un JWT de acceso de corta duración."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.jwt_access_expire_minutes)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": now,
        "type": "access",
        **(extra_claims or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: int) -> str:
    """Crea un JWT de refresco de larga duración."""
    now = datetime.now(timezone.utc)
    expire = now + timedelta(hours=settings.jwt_refresh_expire_hours)
    payload = {
        "sub": str(user_id),
        "exp": expire,
        "iat": now,
        "type": "refresh",
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decodifica y valida un JWT de acceso. Retorna None si es inválido/expirado."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def decode_refresh_token(token: str) -> dict[str, Any] | None:
    """Decodifica y valida un JWT de refresco."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


# ─── OTP ─────────────────────────────────────────────────────────────────────

def generate_otp() -> str:
    """Genera un código OTP numérico de 6 dígitos criptográficamente seguro."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


# ─── Contraseña temporal ──────────────────────────────────────────────────────

_TEMP_ALPHABET = string.ascii_letters + string.digits + "!@#$%^&*"


def generate_temp_password(length: int = 16) -> str:
    """
    Genera una contraseña temporal segura de un solo uso.
    Garantiza al menos una mayúscula, minúscula, número y carácter especial.
    """
    while True:
        pwd = "".join(secrets.choice(_TEMP_ALPHABET) for _ in range(length))
        if (
            any(c.isupper() for c in pwd)
            and any(c.islower() for c in pwd)
            and any(c.isdigit() for c in pwd)
            and any(c in "!@#$%^&*" for c in pwd)
        ):
            return pwd


# ─── Validación de contraseñas ────────────────────────────────────────────────

PASSWORD_SPECIAL_CHARS = set("!@#$%^&*()_+-=[]{}|;':\",./<>?")


def validate_password_strength(password: str) -> list[str]:
    """
    Valida requisitos de contraseña.
    Retorna lista de errores (vacía = contraseña válida).
    """
    errors = []
    if len(password) < 12:
        errors.append("La contraseña debe tener al menos 12 caracteres.")
    if not any(c.isupper() for c in password):
        errors.append("Debe incluir al menos una letra mayúscula.")
    if not any(c.islower() for c in password):
        errors.append("Debe incluir al menos una letra minúscula.")
    if not any(c.isdigit() for c in password):
        errors.append("Debe incluir al menos un número.")
    if not any(c in PASSWORD_SPECIAL_CHARS for c in password):
        errors.append("Debe incluir al menos un carácter especial (!@#$%^&*...).")
    return errors
