# -*- coding: utf-8 -*-
"""Router de autenticación: login, OTP, refresh, logout, cambio de contraseña."""

from fastapi import APIRouter, Request, Response, Depends, Header, status
from fastapi.responses import JSONResponse

from app.auth import service as auth_service
from app.auth.schemas import (
    LoginRequest,
    OtpVerifyRequest,
    OtpResendRequest,
    RefreshRequest,
    ChangePasswordRequest,
    MeResponse,
    TokenResponse,
    AuthSessionResponse,
)
from app.common.security import limiter
from app.dependencies import get_db, get_current_user, DbSession, CurrentUser

router = APIRouter(prefix="/auth", tags=["Autenticación"])

_REFRESH_COOKIE_PREFIX = "refresh_token_"


def _set_refresh_cookie(response: Response, session_id: str, refresh_token: str) -> None:
    """
    Establece el refresh token en cookie HttpOnly amarrada al session_id.
    Cada sesión tiene su propia cookie, así pestañas distintas no se pisan.

    `secure=True` solo en producción: en HTTP localhost los browsers descartan
    cookies marcadas como secure, lo que rompía el flujo de refresh tras 15 min.
    """
    from app.config import settings

    response.set_cookie(
        key=f"{_REFRESH_COOKIE_PREFIX}{session_id}",
        value=refresh_token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        max_age=86400,  # 24 horas
    )


def _clear_refresh_cookie(response: Response, session_id: str | None) -> None:
    if session_id:
        response.delete_cookie(key=f"{_REFRESH_COOKIE_PREFIX}{session_id}")


# ─── Login interno ────────────────────────────────────────────────────────────

@router.post("/internal/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def internal_login(
    request: Request,
    body: LoginRequest,
    db: DbSession,
):
    """Login para usuarios internos (admin, operations, data_science). Sin MFA."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    result = await auth_service.login_internal(
        db, email=body.email, password=body.password, ip_address=ip, user_agent=ua
    )

    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "access_token": result["access_token"],
            "token_type": "bearer",
            "session_id": result["session_id"],
            "must_change_password": result["must_change_password"],
        },
    )
    _set_refresh_cookie(response, result["session_id"], result["refresh_token"])
    return response


# ─── Login externo ETV (paso 1: credenciales) ─────────────────────────────────

@router.post("/external/login", status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def external_login_step1(
    request: Request,
    body: LoginRequest,
    db: DbSession,
):
    """
    Paso 1 del login ETV: valida credenciales y envía OTP por email.
    Si MFA_ENABLED=False, retorna tokens directamente (modo prueba).
    """
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    result = await auth_service.login_external_step1(
        db, email=body.email, password=body.password, ip_address=ip, user_agent=ua
    )

    # MFA desactivado: retornar tokens directamente con cookie
    if result.get("mfa_bypassed"):
        response = JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "access_token": result["access_token"],
                "token_type": "bearer",
                "session_id": result["session_id"],
                "must_change_password": result["must_change_password"],
            },
        )
        _set_refresh_cookie(response, result["session_id"], result["refresh_token"])
        return response

    return result


# ─── Login externo ETV (paso 2: OTP) ─────────────────────────────────────────

@router.post("/external/verify-otp", response_model=TokenResponse)
@limiter.limit("10/minute")
async def external_login_step2(
    request: Request,
    body: OtpVerifyRequest,
    db: DbSession,
):
    """Paso 2 del login ETV: verifica OTP y retorna tokens."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    result = await auth_service.login_external_step2(
        db,
        email=body.email,
        otp_code=body.otp_code,
        session_token=body.session_token,
        ip_address=ip,
        user_agent=ua,
    )

    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "access_token": result["access_token"],
            "token_type": "bearer",
            "session_id": result["session_id"],
            "must_change_password": result["must_change_password"],
        },
    )
    _set_refresh_cookie(response, result["session_id"], result["refresh_token"])
    return response


# ─── Reenvío de OTP ───────────────────────────────────────────────────────────

@router.post("/external/resend-otp", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def resend_otp(
    request: Request,
    body: OtpResendRequest,
    db: DbSession,
):
    """Reenvía el OTP con cooldown de 60s y máximo 3 reenvíos."""
    result = await auth_service.resend_otp(db, email=body.email, session_token=body.session_token)
    return result


# ─── Refresh token ────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    request: Request,
    db: DbSession,
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Renueva el access token. El cliente debe enviar el header X-Session-Id
    para identificar cuál de sus sesiones se está renovando (multi-pestaña).
    """
    from app.common.exceptions import UnauthorizedError

    if not x_session_id:
        raise UnauthorizedError("Falta el identificador de sesión.")

    cookie_name = f"{_REFRESH_COOKIE_PREFIX}{x_session_id}"
    refresh_token = request.cookies.get(cookie_name)
    if not refresh_token:
        raise UnauthorizedError("Refresh token no encontrado.")

    result = await auth_service.refresh_tokens(db, refresh_token, x_session_id)

    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "access_token": result["access_token"],
            "token_type": "bearer",
            "session_id": result["session_id"],
            "must_change_password": False,
        },
    )
    _set_refresh_cookie(response, result["session_id"], result["refresh_token"])
    return response


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: CurrentUser,
    db: DbSession,
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Cierra la sesión actual: la marca como revocada server-side y limpia su cookie.
    Otras sesiones del mismo usuario (otras pestañas/dispositivos) siguen vivas.
    """
    if x_session_id:
        await auth_service.revoke_session(db, x_session_id)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response, x_session_id)
    return response


# ─── Cambio de contraseña ─────────────────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    request: Request,
    body: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
):
    """Cambia la contraseña del usuario autenticado. Obligatorio si must_change_password=true."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    await auth_service.change_password(
        db,
        user=current_user,
        current_password=body.current_password,
        new_password=body.new_password,
        confirm_password=body.confirm_password,
        ip_address=ip,
        user_agent=ua,
    )


# ─── Me ───────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=MeResponse)
async def me(current_user: CurrentUser):
    """Retorna el perfil del usuario autenticado."""
    return current_user


# ─── Sesiones activas (multi-pestaña / multi-dispositivo) ─────────────────────

@router.get("/sessions", response_model=list[AuthSessionResponse])
async def list_my_sessions(
    current_user: CurrentUser,
    db: DbSession,
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Lista las sesiones activas del usuario actual. Marca cuál corresponde a
    esta pestaña (la del header X-Session-Id) para no permitir auto-revocarla
    accidentalmente desde el panel.
    """
    sessions = await auth_service.list_user_sessions(db, current_user.id)
    return [
        AuthSessionResponse(
            session_id=str(s.session_id),
            ip_address=s.ip_address,
            user_agent=s.user_agent,
            created_at=s.created_at,
            last_used_at=s.last_used_at,
            expires_at=s.expires_at,
            is_current=(str(s.session_id) == x_session_id),
        )
        for s in sessions
    ]


@router.post("/sessions/{session_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_my_session(
    session_id: str,
    current_user: CurrentUser,
    db: DbSession,
    x_session_id: str | None = Header(default=None, alias="X-Session-Id"),
):
    """
    Revoca una sesión específica del usuario actual. No permite revocar la
    sesión actual desde aquí (para eso usar /auth/logout).
    """
    from app.common.exceptions import BusinessRuleError, NotFoundError

    if x_session_id and session_id == x_session_id:
        raise BusinessRuleError(
            "No puedes revocar la sesión actual desde aquí. Usa cerrar sesión."
        )

    ok = await auth_service.revoke_user_session(db, current_user.id, session_id)
    if not ok:
        raise NotFoundError("Sesión")
