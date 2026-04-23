# -*- coding: utf-8 -*-
"""Schemas Pydantic del módulo de usuarios."""

from pydantic import BaseModel, EmailStr, field_validator
from app.users.models import UserRole, UserType


class CompanyCreate(BaseModel):
    name: str


class CompanyResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    user_type: UserType
    company_id: int | None = None
    vault_ids: list[int] = []

    @field_validator("company_id")
    @classmethod
    def validate_company_for_etv(cls, v, info):
        if info.data.get("role") == UserRole.etv and not v:
            raise ValueError("Los usuarios ETV deben tener una empresa asignada.")
        return v


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    company_id: int | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    user_type: UserType
    company_id: int | None
    is_active: bool
    must_change_password: bool
    mfa_enabled: bool

    model_config = {"from_attributes": True}


class UserDetailResponse(UserResponse):
    assigned_vault_ids: list[int] = []


class VaultAssignmentRequest(BaseModel):
    vault_ids: list[int]


class PasswordResetResponse(BaseModel):
    """La contraseña temporal se muestra solo una vez al Admin."""
    temp_password: str
    message: str = (
        "Contraseña temporal generada. Comunícala al usuario por un canal seguro. "
        "No se almacenará en texto plano."
    )
