# -*- coding: utf-8 -*-
"""Schemas Pydantic del módulo de autenticación."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator
from app.auth.utils import validate_password_strength


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class OtpVerifyRequest(BaseModel):
    email: EmailStr
    otp_code: str
    session_token: str  # Token temporal generado tras login previo al OTP

    @field_validator("otp_code")
    @classmethod
    def validate_otp_format(cls, v: str) -> str:
        if not v.isdigit() or len(v) != 6:
            raise ValueError("El código OTP debe ser de 6 dígitos numéricos.")
        return v


class OtpResendRequest(BaseModel):
    email: EmailStr
    session_token: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    session_id: str | None = None
    must_change_password: bool = False


class AuthSessionResponse(BaseModel):
    session_id: str
    ip_address: str | None
    user_agent: str | None
    created_at: datetime
    last_used_at: datetime
    expires_at: datetime
    is_current: bool


class RefreshRequest(BaseModel):
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        errors = validate_password_strength(v)
        if errors:
            raise ValueError(" ".join(errors))
        return v

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "new_password" in info.data and v != info.data["new_password"]:
            raise ValueError("Las contraseñas no coinciden.")
        return v


class MeResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    user_type: str
    must_change_password: bool
    mfa_enabled: bool
    company_id: int | None
    empresa_id: int | None = None
    puesto: str | None = None
    etv_subrole: str | None = None

    model_config = {"from_attributes": True}
