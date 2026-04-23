# -*- coding: utf-8 -*-
"""Schemas Pydantic para catálogos."""

from datetime import date
from pydantic import BaseModel


# ─── MovementType ─────────────────────────────────────────────────────────────

class MovementTypeCreate(BaseModel):
    name: str
    description: str | None = None


class MovementTypeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class MovementTypeResponse(BaseModel):
    id: int
    name: str
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


# ─── ModificationReason ───────────────────────────────────────────────────────

class ModificationReasonCreate(BaseModel):
    name: str


class ModificationReasonUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class ModificationReasonResponse(BaseModel):
    id: int
    name: str
    is_active: bool

    model_config = {"from_attributes": True}


# ─── Holiday ──────────────────────────────────────────────────────────────────

class HolidayCreate(BaseModel):
    holiday_date: date
    name: str


class HolidayUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None


class HolidayResponse(BaseModel):
    id: int
    holiday_date: date
    name: str
    is_active: bool

    model_config = {"from_attributes": True}
