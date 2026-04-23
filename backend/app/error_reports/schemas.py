# -*- coding: utf-8 -*-
"""Schemas de reportes de error."""

from datetime import datetime
from pydantic import BaseModel, Field
from app.error_reports.models import ErrorReportStatus


class CreateErrorReportRequest(BaseModel):
    assigned_to: int  # user_id del ETV
    arqueo_header_id: int | None = None
    description: str = Field(min_length=10, max_length=2000)
    record_ids: list[int] = []  # arqueo_record IDs afectados


class RespondErrorReportRequest(BaseModel):
    response: str = Field(min_length=5, max_length=2000)


class ErrorReportResponse(BaseModel):
    id: int
    reported_by: int
    assigned_to: int
    arqueo_header_id: int | None
    status: ErrorReportStatus
    description: str
    response: str | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    record_ids: list[int] = []

    model_config = {"from_attributes": True}
