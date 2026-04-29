# -*- coding: utf-8 -*-
"""Schemas Pydantic del módulo de usuarios."""

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from app.users.models import UserRole, UserType, EtvSubrole


class CompanyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)


class CompanyResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


class EmpresaCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    etv_id: int


class EmpresaUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    etv_id: int | None = None


class EmpresaResponse(BaseModel):
    id: int
    name: str
    etv_id: int
    is_active: bool

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole
    # user_type se deriva del rol: etv → external, resto → internal
    company_id: int | None = None   # ETV (transportadora)
    empresa_id: int | None = None   # Sub-empresa dentro de la ETV
    puesto: str | None = None
    etv_subrole: EtvSubrole | None = None
    vault_ids: list[int] = []

    @field_validator("company_id")
    @classmethod
    def validate_company_for_etv(cls, v, info):
        if info.data.get("role") == UserRole.etv and not v:
            raise ValueError("Los usuarios ETV deben tener una ETV asignada.")
        return v

    @model_validator(mode="after")
    def validate_etv_subrole(self):
        if self.role == UserRole.etv and self.etv_subrole is None:
            raise ValueError(
                "Los usuarios ETV deben tener un sub-rol (Gerente o Tesorero)."
            )
        if self.role != UserRole.etv and self.etv_subrole is not None:
            raise ValueError(
                "El sub-rol Gerente/Tesorero solo aplica a usuarios ETV."
            )
        return self


class UserUpdate(BaseModel):
    full_name: str | None = None
    puesto: str | None = None
    is_active: bool | None = None
    company_id: int | None = None
    empresa_id: int | None = None
    etv_subrole: EtvSubrole | None = None


class UserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    user_type: UserType
    company_id: int | None     # ETV
    empresa_id: int | None     # Sub-empresa
    puesto: str | None
    etv_subrole: EtvSubrole | None
    is_active: bool
    must_change_password: bool
    mfa_enabled: bool
    # True solo para el admin con menor id (cuenta semilla / principal). Nunca
    # puede desactivarse para garantizar que siempre haya control administrativo.
    is_primary_admin: bool = False

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
