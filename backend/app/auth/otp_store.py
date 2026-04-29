# -*- coding: utf-8 -*-
"""
Store en memoria para OTPs y sesiones temporales de MFA.

Almacena en memoria (dict) ya que los OTPs son efímeros (5 min).
Para producción multi-instancia, reemplazar con Redis.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone

from app.config import settings


@dataclass
class OtpSession:
    """Estado de una sesión de verificación OTP."""

    email: str
    otp_code: str
    user_id: int
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    resend_count: int = 0
    verify_attempts: int = 0  # intentos fallidos de verificación del OTP
    last_resend_at: datetime | None = None
    locked_until: datetime | None = None

    def is_expired(self) -> bool:
        """True si el OTP ya expiró (más de 5 min)."""
        elapsed = (datetime.now(timezone.utc) - self.created_at).total_seconds()
        return elapsed > settings.otp_expire_minutes * 60

    def is_locked(self) -> bool:
        """True si la sesión está bloqueada por demasiados reenvíos."""
        if self.locked_until is None:
            return False
        return datetime.now(timezone.utc) < self.locked_until

    def can_resend(self) -> tuple[bool, str]:
        """
        Returns (True, '') si puede reenviar, o (False, mensaje_error) si no puede.
        """
        if self.is_locked():
            return False, "Demasiados intentos. Inténtelo de nuevo más tarde."

        if self.resend_count >= settings.otp_max_resends_per_session:
            return False, "Demasiados intentos. Inténtelo de nuevo más tarde."

        if self.last_resend_at:
            elapsed = (datetime.now(timezone.utc) - self.last_resend_at).total_seconds()
            remaining = settings.otp_resend_cooldown_seconds - elapsed
            if remaining > 0:
                return False, f"Espera {int(remaining)} segundos antes de reenviar."

        return True, ""


# Almacén global en memoria: session_token → OtpSession
_otp_sessions: dict[str, OtpSession] = {}
_lock = asyncio.Lock()


async def create_otp_session(
    session_token: str, email: str, user_id: int, otp_code: str
) -> None:
    """Crea o reemplaza una sesión OTP."""
    async with _lock:
        _otp_sessions[session_token] = OtpSession(
            email=email,
            user_id=user_id,
            otp_code=otp_code,
        )


async def get_otp_session(session_token: str) -> OtpSession | None:
    """Retorna la sesión OTP si existe."""
    async with _lock:
        return _otp_sessions.get(session_token)


async def update_otp_resend(session_token: str, new_otp: str) -> None:
    """Actualiza el OTP y registra el reenvío."""
    async with _lock:
        session = _otp_sessions.get(session_token)
        if not session:
            return
        session.otp_code = new_otp
        session.resend_count += 1
        session.created_at = datetime.now(timezone.utc)  # Reinicia el timer
        session.last_resend_at = datetime.now(timezone.utc)

        # Bloquear si se superó el máximo
        if session.resend_count >= settings.otp_max_resends_per_session:
            from datetime import timedelta
            session.locked_until = datetime.now(timezone.utc) + timedelta(
                minutes=settings.otp_lockout_minutes
            )


async def delete_otp_session(session_token: str) -> None:
    """Elimina la sesión OTP (post-verificación exitosa)."""
    async with _lock:
        _otp_sessions.pop(session_token, None)


async def increment_verify_attempt(session_token: str) -> int:
    """Incrementa contador de intentos fallidos de verificación de OTP y
    devuelve el nuevo valor. Si supera el máximo, la sesión queda bloqueada."""
    from datetime import timedelta
    async with _lock:
        session = _otp_sessions.get(session_token)
        if not session:
            return 0
        session.verify_attempts += 1
        if session.verify_attempts >= settings.otp_max_resends_per_session:
            session.locked_until = datetime.now(timezone.utc) + timedelta(
                minutes=settings.otp_lockout_minutes
            )
        return session.verify_attempts
