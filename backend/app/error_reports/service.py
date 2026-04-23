# -*- coding: utf-8 -*-
"""Servicio de reportes de error (Operaciones → ETV)."""

import logging
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func

from app.error_reports.models import ErrorReport, ErrorReportRecord, ErrorReportStatus
from app.notifications.models import NotificationType
from app.common.exceptions import NotFoundError, ForbiddenError, BusinessRuleError

logger = logging.getLogger(__name__)


async def create_error_report(
    db: AsyncSession,
    reported_by: int,
    assigned_to: int,
    description: str,
    record_ids: list[int],
    arqueo_header_id: int | None,
) -> ErrorReport:
    """
    Crea un reporte de error.
    - reported_by: usuario Operations/Admin
    - assigned_to: usuario ETV al que se asigna
    - Notifica al ETV
    """
    report = ErrorReport(
        reported_by=reported_by,
        assigned_to=assigned_to,
        arqueo_header_id=arqueo_header_id,
        description=description,
        status=ErrorReportStatus.open,
    )
    db.add(report)
    await db.flush()

    for record_id in record_ids:
        link = ErrorReportRecord(
            error_report_id=report.id,
            arqueo_record_id=record_id,
        )
        db.add(link)

    # Notificar al ETV
    from app.notifications.service import create_notification
    await create_notification(
        db,
        recipient_id=assigned_to,
        notification_type=NotificationType.error_reported,
        title="Reporte de error recibido",
        message=f"Operaciones detectó un error en tu arqueo. Descripción: {description[:100]}...",
        sender_id=reported_by,
        entity_type="error_report",
        entity_id=report.id,
    )

    await db.commit()
    await db.refresh(report)
    return report


async def respond_to_error_report(
    db: AsyncSession,
    report_id: int,
    responder_id: int,
    response: str,
) -> ErrorReport:
    """ETV responde al reporte de error."""
    report = await db.get(ErrorReport, report_id)
    if not report:
        raise NotFoundError("Reporte de error")

    if report.assigned_to != responder_id:
        raise ForbiddenError("No tienes permiso para responder este reporte.")

    if report.status not in (ErrorReportStatus.open, ErrorReportStatus.acknowledged):
        raise BusinessRuleError("El reporte ya fue resuelto o cerrado.")

    report.status = ErrorReportStatus.acknowledged
    report.response = response

    # Notificar al que reportó
    from app.notifications.service import create_notification
    await create_notification(
        db,
        recipient_id=report.reported_by,
        notification_type=NotificationType.error_response,
        title="Respuesta a reporte de error",
        message=f"La ETV respondió al reporte #{report.id}: {response[:100]}...",
        sender_id=responder_id,
        entity_type="error_report",
        entity_id=report.id,
    )

    await db.commit()
    await db.refresh(report)
    return report


async def resolve_error_report(
    db: AsyncSession,
    report_id: int,
    resolver_id: int,
) -> ErrorReport:
    """Operaciones/Admin resuelve el reporte."""
    report = await db.get(ErrorReport, report_id)
    if not report:
        raise NotFoundError("Reporte de error")

    report.status = ErrorReportStatus.resolved
    report.resolved_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(report)
    return report


async def list_error_reports(
    db: AsyncSession,
    user_id: int,
    user_role: str,
    status: str | None = None,
    page: int = 1,
    page_size: int = 25,
) -> tuple[list[ErrorReport], int]:
    """
    Lista de reportes:
    - ETV: solo los asignados a ellos.
    - Internos: todos los reportes.
    """
    query = select(ErrorReport)

    if user_role == "etv":
        query = query.where(ErrorReport.assigned_to == user_id)
    else:
        # Operations y Admin ven todos
        pass

    if status:
        query = query.where(ErrorReport.status == status)

    count_q = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_q)).scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(ErrorReport.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    reports = list(result.scalars().all())

    return reports, total


async def get_error_report(
    db: AsyncSession,
    report_id: int,
    user_id: int,
    user_role: str,
) -> ErrorReport:
    report = await db.get(ErrorReport, report_id)
    if not report:
        raise NotFoundError("Reporte de error")

    if user_role == "etv" and report.assigned_to != user_id:
        raise ForbiddenError("No tienes acceso a este reporte.")

    return report
