# -*- coding: utf-8 -*-
"""Router de autenticación: login, OTP, refresh, logout, cambio de contraseña."""

from fastapi import APIRouter, Request, Response, Depends, status
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
)
from app.common.security import limiter
from app.dependencies import get_db, get_current_user, DbSession, CurrentUser

router = APIRouter(prefix="/auth", tags=["Autenticación"])

_REFRESH_COOKIE = "refresh_token"


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    """Establece el refresh token en cookie HttpOnly."""
    response.set_cookie(
        key=_REFRESH_COOKIE,
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=86400,  # 24 horas
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=_REFRESH_COOKIE)


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
            "must_change_password": result["must_change_password"],
        },
    )
    _set_refresh_cookie(response, result["refresh_token"])
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
                "must_change_password": result["must_change_password"],
            },
        )
        _set_refresh_cookie(response, result["refresh_token"])
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
            "must_change_password": result["must_change_password"],
        },
    )
    _set_refresh_cookie(response, result["refresh_token"])
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
async def refresh(request: Request, db: DbSession):
    """Renueva el access token usando el refresh token de la cookie HttpOnly."""
    refresh_token = request.cookies.get(_REFRESH_COOKIE)
    if not refresh_token:
        from app.common.exceptions import UnauthorizedError
        raise UnauthorizedError("Refresh token no encontrado.")

    result = await auth_service.refresh_tokens(refresh_token)

    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content={
            "access_token": result["access_token"],
            "token_type": "bearer",
            "must_change_password": False,
        },
    )
    _set_refresh_cookie(response, result["refresh_token"])
    return response


# ─── Logout ───────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(current_user: CurrentUser):
    """Cierra sesión: limpia la cookie de refresh token."""
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    _clear_refresh_cookie(response)
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
