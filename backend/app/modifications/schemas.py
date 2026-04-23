# -*- coding: utf-8 -*-
"""Schemas Pydantic del módulo de modificaciones."""

from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field
from app.modifications.models import ModificationType


class ModificationBase(BaseModel):
    reason_id: int
    reason_detail: str | None = Field(None, max_length=500)


class AddRecordRequest(ModificationBase):
    """Añadir un nuevo registro a un arqueo publicado (día anterior)."""
    record: dict[str, Any]


class EditRecordRequest(ModificationBase):
    """Editar un registro existente en un arqueo publicado (día anterior)."""
    new_data: dict[str, Any]


class CancelRecordRequest(ModificationBase):
    """Cancelar (dar de baja) un registro existente en un arqueo publicado."""
    pass


class ArqueoModificationResponse(BaseModel):
    id: int
    arqueo_header_id: int
    arqueo_record_id: int | None
    modification_type: ModificationType
    reason_id: int
    reason_detail: str | None
    previous_data: dict | None
    new_data: dict | None
    created_by: int
    created_at: datetime

    model_config = {"from_attributes": True}


class GracePeriodResponse(BaseModel):
    """Estado del periodo de gracia para un arqueo."""
    arqueo_date: str
    grace_deadline: str  # Último día hábil de M+1
    is_within_grace: bool
    days_remaining: int | None
