# -*- coding: utf-8 -*-
"""Servicio de autenticación: login, OTP, refresh, logout, cambio de contraseña."""

import secrets
import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.users.models import User, UserType
from app.auth import otp_store
from app.auth.email_service import send_otp_email
from app.auth.utils import (
    verify_password,
    hash_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    generate_otp,
    generate_temp_password,
    validate_password_strength,
)
from app.audit.service import log_action
from app.common.exceptions import (
    UnauthorizedError,
    ForbiddenError,
    ValidationAppError,
    NotFoundError,
)

logger = logging.getLogger(__name__)


async def login_internal(
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """
    Login para usuarios internos (admin, operations, data_science).
    Retorna access_token + refresh_token directamente (sin MFA).
    """
    user = await _get_active_user_by_email(db, email)

    if not user or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Credenciales incorrectas.")

    if user.user_type != UserType.internal:
        raise ForbiddenError("Este portal es exclusivo para usuarios internos.")

    await log_action(
        db,
        user_id=user.id,
        action="login",
        entity_type="user",
        entity_id=user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()

    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "must_change_password": user.must_change_password,
    }


async def login_external_step1(
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: str | None = None,
) -> dict:
    """
    Primer paso del login ETV: valida credenciales y envía OTP.
    Retorna session_token para usar en el paso 2.
    """
    user = await _get_active_user_by_email(db, email)

    if not user or not verify_password(password, user.password_hash):
        raise UnauthorizedError("Credenciales incorrectas.")

    if user.user_type != UserType.external:
        raise ForbiddenError("Este portal es exclusivo para usuarios ETV.")

    # Generar OTP y session token
    otp_code = generate_otp()
    session_token = secrets.token_urlsafe(32)

    await otp_store.create_otp_session(session_token, email, user.id, otp_code)

    # Enviar OTP por email
    sent = await send_otp_email(user.email, user.full_name, otp_code)
    if not sent:
        logger.warning("Fallo al enviar OTP a %s, pero continuando.", email)

    return {"session_token": session_token, "message": "Código enviado a tu correo."}


async def login_external_step2(
    db: AsyncSession,
    email: str,
    otp_code: str,
    session_token: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """
    Segundo paso del login ETV: verifica OTP y retorna tokens.
    """
    session = await otp_store.get_otp_session(session_token)

    if not session or session.email != email:
        raise UnauthorizedError("Sesión inválida. Inicia el proceso de login nuevamente.")

    if session.is_locked():
        raise UnauthorizedError(
            "Cuenta bloqueada temporalmente. Inténtelo de nuevo en "
            f"{settings.otp_lockout_minutes} minutos."
        )

    if session.is_expired():
        await otp_store.delete_otp_session(session_token)
        raise UnauthorizedError("El código OTP ha expirado. Solicita uno nuevo.")

    if session.otp_code != otp_code:
        raise UnauthorizedError("Código OTP incorrecto.")

    # OTP válido — limpiar sesión temporal
    await otp_store.delete_otp_session(session_token)

    user = await db.get(User, session.user_id)
    if not user or not user.is_active:
        raise UnauthorizedError("Usuario no encontrado o inactivo.")

    await log_action(
        db,
        user_id=user.id,
        action="login",
        entity_type="user",
        entity_id=user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()

    from app.config import settings as cfg
    access_token = create_access_token(user.id)
    refresh_token = create_refresh_token(user.id)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "must_change_password": user.must_change_password,
    }


async def resend_otp(
    db: AsyncSession,
    email: str,
    session_token: str,
) -> dict:
    """Reenvía el OTP si el cooldown lo permite."""
    session = await otp_store.get_otp_session(session_token)

    if not session or session.email != email:
        raise UnauthorizedError("Sesión inválida.")

    can_resend, error_msg = session.can_resend()
    if not can_resend:
        raise UnauthorizedError(error_msg)

    # Generar nuevo OTP
    new_otp = generate_otp()
    await otp_store.update_otp_resend(session_token, new_otp)

    user = await db.get(User, session.user_id)
    if user:
        await send_otp_email(user.email, user.full_name, new_otp)

    return {"message": "Código reenviado a tu correo."}


async def refresh_tokens(refresh_token: str) -> dict:
    """Renueva el access token usando el refresh token."""
    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise UnauthorizedError("Refresh token inválido o expirado.")

    user_id = payload.get("sub")
    access_token = create_access_token(user_id)
    new_refresh = create_refresh_token(user_id)

    return {"access_token": access_token, "refresh_token": new_refresh}


async def change_password(
    db: AsyncSession,
    user: User,
    current_password: str,
    new_password: str,
    confirm_password: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """
    Cambia la contraseña del usuario autenticado.
    Valida contraseña actual, requisitos de seguridad y confirmación.
    """
    if new_password != confirm_password:
        raise ValidationAppError("Las contraseñas no coinciden.")

    if not verify_password(current_password, user.password_hash):
        raise UnauthorizedError("La contraseña actual es incorrecta.")

    errors = validate_password_strength(new_password)
    if errors:
        raise ValidationAppError(" ".join(errors))

    old_hash = user.password_hash
    user.password_hash = hash_password(new_password)
    user.must_change_password = False

    await log_action(
        db,
        user_id=user.id,
        action="password_change",
        entity_type="user",
        entity_id=user.id,
        old_values={"password_hash": "[REDACTED]"},
        new_values={"password_hash": "[REDACTED]", "must_change_password": False},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()


async def _get_active_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Helper: busca usuario activo por email."""
    result = await db.execute(
        select(User).where(User.email == email, User.is_active == True)
    )
    return result.scalar_one_or_none()


# Importar settings aquí para evitar circular
from app.config import settings
