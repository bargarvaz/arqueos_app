# -*- coding: utf-8 -*-
"""Schemas Pydantic de bóvedas, sucursales y personal."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from app.vaults.models import PersonnelType


# ─── Branch ───────────────────────────────────────────────────────────────────

class BranchCreate(BaseModel):
    name: str


class BranchUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class BranchResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Personnel ────────────────────────────────────────────────────────────────

class PersonnelCreate(BaseModel):
    full_name: str
    position: str
    personnel_type: PersonnelType


class PersonnelUpdate(BaseModel):
    full_name: str | None = None
    position: str | None = None
    is_active: bool | None = None


class PersonnelResponse(BaseModel):
    id: int
    full_name: str
    position: str
    personnel_type: PersonnelType
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Vault ────────────────────────────────────────────────────────────────────

class VaultCreate(BaseModel):
    vault_code: str
    vault_name: str
    company_id: int           # ETV (transportadora)
    empresa_id: int | None = None  # Sub-empresa dentro de la ETV
    branch_id: int
    manager_id: int | None = None
    treasurer_id: int | None = None
    initial_balance: Decimal = Field(default=Decimal("0.00"), ge=0)


class VaultUpdate(BaseModel):
    vault_name: str | None = None
    empresa_id: int | None = None
    branch_id: int | None = None
    manager_id: int | None = None
    treasurer_id: int | None = None


class SetInitialBalanceRequest(BaseModel):
    initial_balance: Decimal = Field(ge=0, description="Saldo inicial de la bóveda")


class VaultResponse(BaseModel):
    id: int
    vault_code: str
    vault_name: str
    company_id: int
    empresa_id: int | None
    branch_id: int
    manager_id: int | None
    treasurer_id: int | None
    initial_balance: Decimal
    is_active: bool
    deactivated_at: datetime | None
    reactivated_at: datetime | None

    model_config = {"from_attributes": True}
