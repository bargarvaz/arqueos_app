# -*- coding: utf-8 -*-
"""Router de reportes de error."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_roles
from app.users.models import User
from app.error_reports.schemas import (
    CreateErrorReportRequest,
    RespondErrorReportRequest,
    ErrorReportResponse,
)
from app.error_reports import service
from app.common.pagination import PaginationParams, PagedResponse

router = APIRouter(prefix="/error-reports", tags=["Reportes de Error"])


def _to_response(report) -> dict:
    return {
        "id": report.id,
        "reported_by": report.reported_by,
        "assigned_to": report.assigned_to,
        "arqueo_header_id": report.arqueo_header_id,
        "status": report.status,
        "description": report.description,
        "response": report.response,
        "resolved_at": report.resolved_at,
        "created_at": report.created_at,
        "updated_at": report.updated_at,
        "record_ids": [link.arqueo_record_id for link in report.record_links],
    }


@router.get(
    "",
    response_model=PagedResponse[ErrorReportResponse],
    summary="Listar reportes de error",
)
async def list_error_reports(
    status: str | None = Query(None),
    pagination: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    reports, total = await service.list_error_reports(
        db,
        user_id=current_user.id,
        user_role=current_user.role,
        status=status,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    return PagedResponse.build(
        [_to_response(r) for r in reports], total, pagination
    )


@router.post(
    "",
    response_model=ErrorReportResponse,
    status_code=201,
    summary="Crear reporte de error (Operaciones/Admin)",
)
async def create_error_report(
    body: CreateErrorReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "operations")),
):
    report = await service.create_error_report(
        db,
        reported_by=current_user.id,
        assigned_to=body.assigned_to,
        description=body.description,
        record_ids=body.record_ids,
        arqueo_header_id=body.arqueo_header_id,
    )
    return _to_response(report)


@router.put(
    "/{report_id}/respond",
    response_model=ErrorReportResponse,
    summary="ETV responde al reporte de error",
)
async def respond_error_report(
    report_id: int,
    body: RespondErrorReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    report = await service.respond_to_error_report(
        db,
        report_id=report_id,
        responder_id=current_user.id,
        response=body.response,
    )
    return _to_response(report)


@router.put(
    "/{report_id}/resolve",
    response_model=ErrorReportResponse,
    summary="Marcar reporte como resuelto (Operaciones/Admin)",
)
async def resolve_error_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "operations")),
):
    report = await service.resolve_error_report(
        db,
        report_id=report_id,
        resolver_id=current_user.id,
    )
    return _to_response(report)
