# -*- coding: utf-8 -*-
"""Schemas Pydantic de bóvedas, sucursales y personal."""

from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator


# ─── Denominaciones (saldo inicial / inventario) ──────────────────────────────

# Multiplicadores por denominación. Usados para calcular el saldo total
# como suma(qty * value) — pero los modelos guardan el VALOR, no la cantidad.
# Es decir: initial_bill_1000 es "monto en billetes de 1000", no "cuántos billetes".

DENOMINATION_FIELDS = [
    "initial_bill_1000", "initial_bill_500", "initial_bill_200",
    "initial_bill_100", "initial_bill_50", "initial_bill_20",
    "initial_coin_100", "initial_coin_50", "initial_coin_20",
    "initial_coin_10", "initial_coin_5", "initial_coin_2",
    "initial_coin_1", "initial_coin_050", "initial_coin_020", "initial_coin_010",
]


class InitialDenominations(BaseModel):
    """Saldo inicial de la bóveda desglosado por denominación (valor monetario)."""
    initial_bill_1000: Decimal = Field(default=Decimal("0"), ge=0)
    initial_bill_500: Decimal = Field(default=Decimal("0"), ge=0)
    initial_bill_200: Decimal = Field(default=Decimal("0"), ge=0)
    initial_bill_100: Decimal = Field(default=Decimal("0"), ge=0)
    initial_bill_50: Decimal = Field(default=Decimal("0"), ge=0)
    initial_bill_20: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_100: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_50: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_20: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_10: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_5: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_2: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_1: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_050: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_020: Decimal = Field(default=Decimal("0"), ge=0)
    initial_coin_010: Decimal = Field(default=Decimal("0"), ge=0)

    @property
    def total(self) -> Decimal:
        return sum(
            (getattr(self, f) for f in DENOMINATION_FIELDS),
            start=Decimal("0"),
        )


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


# ─── Vault ────────────────────────────────────────────────────────────────────

class VaultCreate(BaseModel):
    vault_code: str
    vault_name: str
    company_id: int           # ETV (transportadora)
    empresa_id: int | None = None  # Sub-empresa dentro de la ETV
    # branch_id se resuelve automáticamente desde vault_code en el servicio
    manager_id: int | None = None
    treasurer_id: int | None = None
    initial_denominations: InitialDenominations = Field(default_factory=InitialDenominations)
    # initial_balance se calcula desde initial_denominations en el service.
    # Si el cliente lo envía, debe coincidir con la suma; si no, se ignora.


class VaultUpdate(BaseModel):
    vault_name: str | None = None
    company_id: int | None = None  # ETV (transportadora)
    empresa_id: int | None = None
    manager_id: int | None = None
    treasurer_id: int | None = None
    initial_denominations: InitialDenominations | None = None


class SetInitialBalanceRequest(BaseModel):
    """
    Establece el saldo inicial via denominaciones.

    Si se envía `initial_denominations`, el initial_balance se calcula como su
    suma. `initial_balance` solo se acepta cuando todas las denominaciones son 0
    (modo legacy; deja la bóveda en estado "sin migrar").
    """
    initial_balance: Decimal | None = Field(default=None, ge=0)
    initial_denominations: InitialDenominations | None = None

    @model_validator(mode="after")
    def at_least_one(self):
        if self.initial_balance is None and self.initial_denominations is None:
            raise ValueError("Debes enviar initial_balance o initial_denominations.")
        return self


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
    current_balance: Decimal | None = None  # Último closing publicado (None si nunca arqueada)
    # Saldo inicial desglosado
    initial_bill_1000: Decimal
    initial_bill_500: Decimal
    initial_bill_200: Decimal
    initial_bill_100: Decimal
    initial_bill_50: Decimal
    initial_bill_20: Decimal
    initial_coin_100: Decimal
    initial_coin_50: Decimal
    initial_coin_20: Decimal
    initial_coin_10: Decimal
    initial_coin_5: Decimal
    initial_coin_2: Decimal
    initial_coin_1: Decimal
    initial_coin_050: Decimal
    initial_coin_020: Decimal
    initial_coin_010: Decimal
    is_active: bool
    deactivated_at: datetime | None
    reactivated_at: datetime | None

    @property
    def needs_denomination_migration(self) -> bool:
        """True si initial_balance > 0 pero las denominaciones están en 0 (sin migrar)."""
        if self.initial_balance == 0:
            return False
        return all(
            getattr(self, f) == 0 for f in DENOMINATION_FIELDS
        )

    model_config = {"from_attributes": True}
