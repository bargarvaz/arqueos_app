# -*- coding: utf-8 -*-
"""Servicio de autenticación: login, OTP, refresh, logout, cambio de contraseña."""

import hmac
import secrets
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, or_

from app.users.models import User, UserType
from app.auth import otp_store
from app.auth.email_service import send_otp_email
from app.auth.session_model import AuthSession
from app.auth.utils import (
    verify_password,
    hash_password,
    hash_refresh_token,
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


# ─── Lockout por intentos fallidos ────────────────────────────────────────────

MAX_FAILED_ATTEMPTS = 5  # al 5° intento la cuenta queda bloqueada
LOCKOUT_DURATION = timedelta(minutes=15)

# Hash precomputado para verificación dummy cuando el email no existe.
# Anula el timing attack de enumeración (bcrypt ~200ms para hashes reales,
# ~0ms si no se ejecuta). Calculado en boot para que sea constante.
_DUMMY_PASSWORD_HASH: str | None = None


def _get_dummy_hash() -> str:
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        _DUMMY_PASSWORD_HASH = hash_password("dummy-not-a-real-password")
    return _DUMMY_PASSWORD_HASH


async def _check_credentials(db: AsyncSession, email: str, password: str) -> User:
    """Valida email + password aplicando lockout automático.

    Reglas:
      - Cuentas con rol `admin` están EXENTAS del lockout (para que un admin
        nunca quede fuera del sistema y pueda desbloquear a otros).
      - Si la cuenta tiene `locked_until` vigente → 401 con mensaje y minutos restantes.
      - Password OK → resetea `failed_login_attempts` y `locked_until`, devuelve user.
      - Password incorrecta → incrementa contador.
        - Al alcanzar `MAX_FAILED_ATTEMPTS` (5), bloquea por `LOCKOUT_DURATION` y
          resetea el contador.
        - En el penúltimo intento (4) el mensaje avisa "te queda 1 intento".
      - Email inexistente → 401 genérico (no enumera usuarios).

    Lanza siempre `UnauthorizedError` cuando hay falla.
    """
    from app.users.models import UserRole

    user = await _get_active_user_by_email(db, email)
    now = datetime.now(timezone.utc)
    is_admin = bool(user and user.role == UserRole.admin)

    # Solo bloquear cuentas no-admin
    if user and not is_admin and user.locked_until and user.locked_until > now:
        remaining_min = max(1, int((user.locked_until - now).total_seconds() // 60) + 1)
        raise UnauthorizedError(
            f"Cuenta bloqueada por múltiples intentos fallidos. "
            f"Intenta nuevamente en {remaining_min} minuto"
            f"{'s' if remaining_min != 1 else ''}."
        )

    if user and verify_password(password, user.password_hash):
        # Login válido → limpia el estado de lockout si lo había.
        if user.failed_login_attempts or user.locked_until:
            user.failed_login_attempts = 0
            user.locked_until = None
        return user

    # ── A partir de aquí: credenciales inválidas ───────────────────────────
    if not user:
        # No existe (o está inactivo) → mensaje genérico, no incrementamos nada.
        # Ejecutamos verify_password contra un hash dummy para que el tiempo
        # total de respuesta sea similar al de un email real con pass mala.
        # Sin esto, un atacante puede enumerar usuarios midiendo timing.
        verify_password(password, _get_dummy_hash())
        raise UnauthorizedError("Credenciales incorrectas.")

    if is_admin:
        # Admin: no se incrementa contador ni se bloquea, pero sí se loguea
        # para detección de patrones de ataque (ya queda en audit_log al
        # nivel del request handler).
        raise UnauthorizedError("Credenciales incorrectas.")

    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
    attempts = user.failed_login_attempts

    if attempts >= MAX_FAILED_ATTEMPTS:
        user.locked_until = now + LOCKOUT_DURATION
        user.failed_login_attempts = 0
        await db.commit()
        raise UnauthorizedError(
            "Credenciales incorrectas. La cuenta ha sido bloqueada por "
            f"{int(LOCKOUT_DURATION.total_seconds() // 60)} minutos "
            "por múltiples intentos fallidos."
        )

    if attempts == MAX_FAILED_ATTEMPTS - 1:
        await db.commit()
        raise UnauthorizedError(
            "Credenciales incorrectas. Te queda 1 intento antes de que la "
            "cuenta sea bloqueada."
        )

    await db.commit()
    raise UnauthorizedError("Credenciales incorrectas.")


# ─── Sesiones server-side ────────────────────────────────────────────────────

async def _sweep_expired_sessions(db: AsyncSession) -> None:
    """Borra filas de sesiones ya expiradas o revocadas. Idempotente."""
    now = datetime.now(timezone.utc)
    await db.execute(
        delete(AuthSession).where(
            or_(
                AuthSession.expires_at < now,
                AuthSession.revoked_at.is_not(None),
            )
        )
    )


async def _create_session(
    db: AsyncSession,
    user_id: int,
    ip_address: str | None,
    user_agent: str | None,
) -> tuple[str, str]:
    """
    Crea una nueva fila en auth_sessions y retorna (session_id, refresh_token).

    Limpia sesiones expiradas/revocadas antes de insertar para evitar acumulación.
    El refresh token JWT incluye el session_id como claim `sid`. La fila guarda
    el hash SHA-256 del JWT para detectar reuso si fuera robado.
    """
    from app.config import settings as cfg

    await _sweep_expired_sessions(db)

    session_id = uuid4()
    refresh_token = create_refresh_token(user_id, session_id=str(session_id))
    expires_at = datetime.now(timezone.utc) + timedelta(
        hours=cfg.jwt_refresh_expire_hours
    )

    session = AuthSession(
        session_id=session_id,
        user_id=user_id,
        refresh_hash=hash_refresh_token(refresh_token),
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
        expires_at=expires_at,
    )
    db.add(session)
    await db.flush()
    return str(session_id), refresh_token


async def revoke_session(db: AsyncSession, session_id: str) -> None:
    """Marca una sesión como revocada. Idempotente: si no existe, no hace nada."""
    try:
        sid = UUID(session_id)
    except (ValueError, TypeError):
        return
    session = await db.get(AuthSession, sid)
    if session and session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()


async def list_user_sessions(
    db: AsyncSession,
    user_id: int,
) -> list[AuthSession]:
    """Lista las sesiones activas (no revocadas y no expiradas) del usuario."""
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now,
        )
        .order_by(AuthSession.last_used_at.desc())
    )
    return list(result.scalars().all())


async def revoke_user_session(
    db: AsyncSession,
    user_id: int,
    session_id: str,
) -> bool:
    """
    Revoca una sesión si pertenece al usuario indicado.
    Retorna True si se revocó, False si no existe o no pertenece al usuario.
    """
    try:
        sid = UUID(session_id)
    except (ValueError, TypeError):
        return False
    session = await db.get(AuthSession, sid)
    if not session or session.user_id != user_id:
        return False
    if session.revoked_at is None:
        session.revoked_at = datetime.now(timezone.utc)
        await db.commit()
    return True


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
    user = await _check_credentials(db, email, password)

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

    session_id, refresh_token = await _create_session(
        db, user.id, ip_address, user_agent
    )
    access_token = create_access_token(user.id)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "session_id": session_id,
        "must_change_password": user.must_change_password,
    }


async def login_external_step1(
    db: AsyncSession,
    email: str,
    password: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict:
    """
    Primer paso del login ETV: valida credenciales y envía OTP.
    Si settings.mfa_enabled=False, retorna tokens directamente (modo prueba).
    """
    user = await _check_credentials(db, email, password)

    if user.user_type != UserType.external:
        raise ForbiddenError("Este portal es exclusivo para usuarios ETV.")

    # ── Modo prueba: MFA desactivado ─────────────────────────────────────────
    if not settings.mfa_enabled:
        await log_action(
            db,
            user_id=user.id,
            action="login",
            entity_type="user",
            entity_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        session_id, refresh_token = await _create_session(
            db, user.id, ip_address, user_agent
        )
        access_token = create_access_token(user.id)
        await db.commit()
        return {
            "mfa_bypassed": True,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "session_id": session_id,
            "must_change_password": user.must_change_password,
        }

    # ── Flujo normal con OTP ──────────────────────────────────────────────────
    otp_code = generate_otp()
    session_token = secrets.token_urlsafe(32)

    await otp_store.create_otp_session(session_token, email, user.id, otp_code)

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

    # Comparación en tiempo constante (evita timing attack carácter a carácter)
    if not hmac.compare_digest(str(session.otp_code), str(otp_code)):
        attempts = await otp_store.increment_verify_attempt(session_token)
        max_attempts = settings.otp_max_resends_per_session
        if attempts >= max_attempts:
            raise UnauthorizedError(
                "Demasiados códigos incorrectos. Solicita uno nuevo más tarde."
            )
        remaining = max_attempts - attempts
        if remaining == 1:
            raise UnauthorizedError(
                "Código OTP incorrecto. Te queda 1 intento."
            )
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

    session_id, refresh_token = await _create_session(
        db, user.id, ip_address, user_agent
    )
    access_token = create_access_token(user.id)
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "session_id": session_id,
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


async def refresh_tokens(
    db: AsyncSession,
    refresh_token: str,
    session_id: str | None,
) -> dict:
    """
    Renueva el access token validando contra la sesión server-side.

    Reglas:
    - El JWT debe ser válido y de tipo refresh.
    - El claim `sid` del JWT debe coincidir con `session_id` enviado por el cliente.
    - La fila auth_sessions debe existir, no estar revocada, no estar expirada,
      y su refresh_hash debe coincidir con el hash del token presentado
      (detección de reuso si fue robado).
    - Si todo OK, rotamos el refresh_hash (nuevo token) y actualizamos last_used_at.
    """
    payload = decode_refresh_token(refresh_token)
    if not payload:
        raise UnauthorizedError("Refresh token inválido o expirado.")

    token_sid = payload.get("sid")
    if not session_id or not token_sid or token_sid != session_id:
        raise UnauthorizedError("Sesión no coincide con el token.")

    try:
        sid = UUID(session_id)
    except (ValueError, TypeError):
        raise UnauthorizedError("Identificador de sesión inválido.")

    session = await db.get(AuthSession, sid)
    now = datetime.now(timezone.utc)
    if (
        not session
        or session.revoked_at is not None
        or session.expires_at < now
        or session.refresh_hash != hash_refresh_token(refresh_token)
    ):
        raise UnauthorizedError("Sesión inválida o expirada.")

    user_id = int(payload["sub"])
    new_refresh = create_refresh_token(user_id, session_id=session_id)
    session.refresh_hash = hash_refresh_token(new_refresh)
    session.last_used_at = now
    await db.commit()

    return {
        "access_token": create_access_token(user_id),
        "refresh_token": new_refresh,
        "session_id": session_id,
    }


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
    # Cambiar la contraseña limpia el estado de lockout, por si quedó residual.
    user.failed_login_attempts = 0
    user.locked_until = None

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


# ─── Recuperación de contraseña (auto-servicio) ──────────────────────────────

async def request_password_reset(
    db: AsyncSession,
    email: str,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """
    Genera contraseña temporal y la envía por correo al usuario.

    Por seguridad nunca revela si el email existe (no enumera usuarios). El
    endpoint siempre responde 200; este servicio puede o no haber actuado.

    Si actúa:
      - Genera temp password fuerte y la hashea.
      - Marca `must_change_password = True`.
      - Limpia lockout (`failed_login_attempts = 0`, `locked_until = None`).
      - Envía el correo en background (fallar el envío no debe bloquear el
        endpoint, pero se loguea).
      - Audita la acción como `password_reset_request`.
    """
    from app.auth.email_service import send_password_reset_notification
    from app.common.background import fire_and_forget

    user = await _get_active_user_by_email(db, email)
    if user is None:
        # No-op silencioso para no enumerar
        return

    temp_password = generate_temp_password()
    user.password_hash = hash_password(temp_password)
    user.must_change_password = True
    user.failed_login_attempts = 0
    user.locked_until = None

    await log_action(
        db,
        user_id=user.id,
        action="password_reset_request",
        entity_type="user",
        entity_id=user.id,
        new_values={"must_change_password": True},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    await db.commit()

    # Envío de correo fuera de la transacción
    async def _send():
        try:
            await send_password_reset_notification(
                recipient_email=user.email,
                recipient_name=user.full_name,
                temp_password=temp_password,
            )
        except Exception:
            # El helper logueará la excepción
            raise

    fire_and_forget(_send(), name=f"forgot-password-{user.id}")


# Importar settings aquí para evitar circular
from app.config import settings
