# -*- coding: utf-8 -*-
"""Schemas Pydantic del módulo de arqueos."""

from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from app.arqueos.models import ArqueoStatus, CounterpartType


class ArqueoRecordCreate(BaseModel):
    """Datos para crear un registro individual de arqueo."""

    record_uid: str | None = None  # presente al re-publicar, None para registros nuevos
    voucher: str = Field(min_length=1, max_length=100)
    reference: str = Field(min_length=1, max_length=100)
    sucursal_id: int | None = None
    movement_type_id: int
    entries: Decimal = Field(default=Decimal("0"), ge=0)
    withdrawals: Decimal = Field(default=Decimal("0"), ge=0)

    # Denominaciones — billetes
    bill_1000: Decimal = Field(default=Decimal("0"), ge=0)
    bill_500: Decimal = Field(default=Decimal("0"), ge=0)
    bill_200: Decimal = Field(default=Decimal("0"), ge=0)
    bill_100: Decimal = Field(default=Decimal("0"), ge=0)
    bill_50: Decimal = Field(default=Decimal("0"), ge=0)
    bill_20: Decimal = Field(default=Decimal("0"), ge=0)

    # Denominaciones — monedas
    coin_100: Decimal = Field(default=Decimal("0"), ge=0)
    coin_50: Decimal = Field(default=Decimal("0"), ge=0)
    coin_20: Decimal = Field(default=Decimal("0"), ge=0)
    coin_10: Decimal = Field(default=Decimal("0"), ge=0)
    coin_5: Decimal = Field(default=Decimal("0"), ge=0)
    coin_2: Decimal = Field(default=Decimal("0"), ge=0)
    coin_1: Decimal = Field(default=Decimal("0"), ge=0)
    coin_050: Decimal = Field(default=Decimal("0"), ge=0)
    coin_020: Decimal = Field(default=Decimal("0"), ge=0)
    coin_010: Decimal = Field(default=Decimal("0"), ge=0)

    record_date: date


class ArqueoRecordUpdate(ArqueoRecordCreate):
    """Actualización de un registro (mismos campos, todos opcionales salvo los críticos)."""
    pass


class ArqueoRecordResponse(BaseModel):
    id: int
    record_uid: str
    arqueo_header_id: int
    voucher: str
    reference: str
    sucursal_id: int | None = None
    entries: Decimal
    withdrawals: Decimal
    bill_1000: Decimal
    bill_500: Decimal
    bill_200: Decimal
    bill_100: Decimal
    bill_50: Decimal
    bill_20: Decimal
    coin_100: Decimal
    coin_50: Decimal
    coin_20: Decimal
    coin_10: Decimal
    coin_5: Decimal
    coin_2: Decimal
    coin_1: Decimal
    coin_050: Decimal
    coin_020: Decimal
    coin_010: Decimal
    movement_type_id: int
    is_counterpart: bool
    counterpart_type: CounterpartType | None
    original_record_uid: str | None
    record_date: date
    upload_date: datetime
    is_active: bool
    created_by: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArqueoHeaderCreate(BaseModel):
    vault_id: int
    arqueo_date: date


class PublishArqueoRequest(BaseModel):
    """Datos necesarios para publicar: registros + timestamp para optimistic locking."""
    records: list[ArqueoRecordCreate]
    updated_at: datetime  # Versión del header en el frontend (optimistic locking)


class ArqueoHeaderResponse(BaseModel):
    id: int
    vault_id: int
    vault_code: str | None = None
    vault_name: str | None = None
    arqueo_date: date
    opening_balance: Decimal
    closing_balance: Decimal
    status: ArqueoStatus
    published_at: datetime | None
    locked_at: datetime | None
    auto_published: bool = False
    created_by: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ArqueoHeaderWithRecordsResponse(ArqueoHeaderResponse):
    records: list[ArqueoRecordResponse] = []


# ─── Saldos finales (closings mensuales por bóveda) ───────────────────────────

class DailyClosingItem(BaseModel):
    """Cierre diario de una bóveda con desglose por denominación."""
    arqueo_date: date
    status: ArqueoStatus
    closing_balance: Decimal
    # Marca el día "ancla" (creación o reset de saldo). En esos días no hay
    # cierre real: lo que se muestra es el saldo inicial declarado por admin.
    is_anchor: bool = False
    bill_1000: Decimal
    bill_500: Decimal
    bill_200: Decimal
    bill_100: Decimal
    bill_50: Decimal
    bill_20: Decimal
    coin_100: Decimal
    coin_50: Decimal
    coin_20: Decimal
    coin_10: Decimal
    coin_5: Decimal
    coin_2: Decimal
    coin_1: Decimal
    coin_050: Decimal
    coin_020: Decimal
    coin_010: Decimal


class MonthlyClosingsResponse(BaseModel):
    vault_id: int
    vault_code: str
    vault_name: str
    year: int
    month: int
    unmigrated: bool = False
    items: list[DailyClosingItem] = []
