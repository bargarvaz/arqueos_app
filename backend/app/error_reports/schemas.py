# -*- coding: utf-8 -*-
"""Schemas de reportes de error."""

from datetime import datetime
from pydantic import BaseModel, Field
from app.error_reports.models import ErrorReportStatus


class CreateErrorReportRequest(BaseModel):
    """
    Crea un reporte de error.

    `assigned_to` es opcional: si no se envía y se proporciona `arqueo_header_id`,
    el backend autoresuelve al destinatario desde la bóveda del arqueo
    (manager → treasurer → primer asignado al vault).
    """
    assigned_to: int | None = None
    arqueo_header_id: int | None = None
    error_type_id: int = Field(..., description="ID del tipo de error (catálogo)")
    description: str = Field(min_length=10, max_length=2000)
    record_ids: list[int] = []  # arqueo_record IDs afectados


class AutoAssignPreviewResponse(BaseModel):
    """Vista previa de a quién se asignaría un reporte si se creara desde un header."""
    arqueo_header_id: int
    vault_id: int
    vault_code: str | None
    vault_name: str | None
    assigned_user_id: int | None
    assigned_user_name: str | None
    assigned_via: str | None  # 'manager' | 'treasurer' | 'vault_assignment' | None


class RespondErrorReportRequest(BaseModel):
    response: str = Field(min_length=5, max_length=2000)


class ReportedRecordSummary(BaseModel):
    """Resumen del registro de arqueo asociado a un reporte."""
    id: int
    record_uid: str
    voucher: str
    reference: str
    entries: str
    withdrawals: str
    movement_type_name: str | None = None
    sucursal_name: str | None = None
    record_date: str | None = None


class ErrorReportResponse(BaseModel):
    id: int
    reported_by: int
    reported_by_name: str | None = None
    assigned_to: int
    assigned_to_name: str | None = None
    arqueo_header_id: int | None
    arqueo_date: str | None = None
    vault_id: int | None = None
    vault_code: str | None = None
    vault_name: str | None = None
    error_type_id: int | None = None
    error_type_name: str | None = None
    status: ErrorReportStatus
    description: str
    response: str | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    record_ids: list[int] = []
    records: list[ReportedRecordSummary] = []

    model_config = {"from_attributes": True}
