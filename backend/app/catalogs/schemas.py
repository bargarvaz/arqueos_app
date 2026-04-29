# -*- coding: utf-8 -*-
"""Schemas Pydantic para catálogos."""

from datetime import date
from pydantic import BaseModel, Field


# ─── MovementType ─────────────────────────────────────────────────────────────

class MovementTypeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class MovementTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class MovementTypeResponse(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


# ─── ModificationReason ───────────────────────────────────────────────────────

class ModificationReasonCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)


class ModificationReasonUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    is_active: bool | None = None


class ModificationReasonResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Holiday ──────────────────────────────────────────────────────────────────

class HolidayCreate(BaseModel):
    holiday_date: date
    name: str = Field(min_length=2, max_length=200)


class HolidayUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    is_active: bool | None = None


class HolidayResponse(BaseModel):
    id: int
    holiday_date: date
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Sucursal ─────────────────────────────────────────────────────────────────

class SucursalCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)


class SucursalUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    is_active: bool | None = None


class SucursalResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


# ─── ErrorType ────────────────────────────────────────────────────────────────

class ErrorTypeCreate(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=500)


class ErrorTypeUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    is_active: bool | None = None


class ErrorTypeResponse(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}
