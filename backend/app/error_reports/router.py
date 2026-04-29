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
    """Versión simple sin enriquecer (legacy)."""
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
        "records": [],
    }


async def _to_response_enriched(db, report) -> dict:
    """Versión que enriquece con datos de bóveda, fecha del arqueo, registros y nombres de usuarios."""
    from app.arqueos.models import ArqueoHeader, ArqueoRecord
    from app.vaults.models import Vault
    from app.users.models import User as UserModel
    from app.catalogs.models import MovementType, Sucursal, ErrorType
    from sqlalchemy import select

    base = _to_response(report)

    # Reportador / asignado
    if report.reported_by:
        u = await db.get(UserModel, report.reported_by)
        base["reported_by_name"] = u.full_name if u else None
    if report.assigned_to:
        u = await db.get(UserModel, report.assigned_to)
        base["assigned_to_name"] = u.full_name if u else None

    # Tipo de error
    if report.error_type_id:
        et = await db.get(ErrorType, report.error_type_id)
        base["error_type_id"] = report.error_type_id
        base["error_type_name"] = et.name if et else None

    # Bóveda y fecha del header
    if report.arqueo_header_id:
        header = await db.get(ArqueoHeader, report.arqueo_header_id)
        if header:
            base["arqueo_date"] = str(header.arqueo_date)
            vault = await db.get(Vault, header.vault_id)
            if vault:
                base["vault_id"] = vault.id
                base["vault_code"] = vault.vault_code
                base["vault_name"] = vault.vault_name

    # Registros con detalle
    record_ids = base["record_ids"]
    if record_ids:
        rows = await db.execute(
            select(
                ArqueoRecord,
                MovementType.name.label("mt_name"),
                Sucursal.name.label("suc_name"),
            )
            .outerjoin(MovementType, MovementType.id == ArqueoRecord.movement_type_id)
            .outerjoin(Sucursal, Sucursal.id == ArqueoRecord.sucursal_id)
            .where(ArqueoRecord.id.in_(record_ids))
        )
        base["records"] = [
            {
                "id": rec.id,
                "record_uid": rec.record_uid,
                "voucher": rec.voucher,
                "reference": rec.reference,
                "entries": str(rec.entries),
                "withdrawals": str(rec.withdrawals),
                "movement_type_name": mt_name,
                "sucursal_name": suc_name,
                "record_date": str(rec.record_date),
            }
            for rec, mt_name, suc_name in rows.all()
        ]

    return base


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
    enriched = [await _to_response_enriched(db, r) for r in reports]
    return PagedResponse.build(enriched, total, pagination)


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
        error_type_id=body.error_type_id,
    )
    return await _to_response_enriched(db, report)


@router.get(
    "/auto-assign-preview",
    summary="A quién se asignaría un reporte para un header dado",
)
async def auto_assign_preview(
    arqueo_header_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_roles("admin", "operations")),
):
    """
    Preview que el frontend usa para mostrar al destinatario antes de enviar.
    """
    from app.arqueos.models import ArqueoHeader
    from app.vaults.models import Vault
    from app.users.models import User as UserModel
    from app.common.exceptions import NotFoundError

    header = await db.get(ArqueoHeader, arqueo_header_id)
    if not header:
        raise NotFoundError("Arqueo")

    vault = await db.get(Vault, header.vault_id)
    user_id, via = await service.resolve_assignee_for_header(db, arqueo_header_id)
    user_name = None
    if user_id:
        u = await db.get(UserModel, user_id)
        user_name = u.full_name if u else None

    return {
        "arqueo_header_id": arqueo_header_id,
        "vault_id": vault.id if vault else None,
        "vault_code": vault.vault_code if vault else None,
        "vault_name": vault.vault_name if vault else None,
        "assigned_user_id": user_id,
        "assigned_user_name": user_name,
        "assigned_via": via,
    }


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
    return await _to_response_enriched(db, report)


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
    return await _to_response_enriched(db, report)
