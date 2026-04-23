# -*- coding: utf-8 -*-
"""Router del módulo de modificaciones de arqueos."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_roles
from app.users.models import User
from app.arqueos.schemas import ArqueoRecordResponse, ArqueoHeaderWithRecordsResponse
from app.modifications.schemas import (
    AddRecordRequest,
    EditRecordRequest,
    CancelRecordRequest,
    ArqueoModificationResponse,
    GracePeriodResponse,
)
from app.modifications import service
from app.arqueos import service as arqueo_service

router = APIRouter(prefix="/modifications", tags=["Modificaciones"])


@router.get(
    "/my-arqueos",
    summary="Arqueos modificables del ETV (dentro del periodo de gracia)",
)
async def list_modifiable_arqueos(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    return await service.list_modifiable_headers(db, user_id=current_user.id)


@router.get(
    "/{header_id}/grace-period",
    response_model=GracePeriodResponse,
    summary="Estado del periodo de gracia de un arqueo",
)
async def get_grace_period(
    header_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.arqueos.service import get_header
    header = await get_header(db, header_id)

    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    is_within, deadline, days_remaining = await service.check_grace_period(
        db, header.arqueo_date
    )
    return GracePeriodResponse(
        arqueo_date=str(header.arqueo_date),
        grace_deadline=str(deadline),
        is_within_grace=is_within,
        days_remaining=days_remaining,
    )


@router.get(
    "/{header_id}/history",
    response_model=list[ArqueoModificationResponse],
    summary="Historial de modificaciones de un arqueo",
)
async def get_modification_history(
    header_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    header = await arqueo_service.get_header(db, header_id)

    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    return await service.list_modifications(db, header_id)


@router.post(
    "/{header_id}/add",
    response_model=ArqueoRecordResponse,
    status_code=201,
    summary="Añadir registro a un arqueo publicado",
)
async def add_record(
    header_id: int,
    body: AddRecordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    # Verificar que la bóveda es del ETV
    header = await arqueo_service.get_header(db, header_id)
    from app.arqueos.service import _verify_vault_assignment
    await _verify_vault_assignment(db, current_user.id, header.vault_id)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    return await service.add_record(
        db=db,
        header_id=header_id,
        record_data=body.record,
        user_id=current_user.id,
        reason_id=body.reason_id,
        reason_detail=body.reason_detail,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post(
    "/records/{record_uid}/edit",
    response_model=ArqueoRecordResponse,
    summary="Editar un registro de un arqueo publicado",
)
async def edit_record(
    record_uid: str,
    body: EditRecordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    from sqlalchemy import select
    from app.arqueos.models import ArqueoRecord
    rec_result = await db.execute(
        select(ArqueoRecord).where(
            ArqueoRecord.record_uid == record_uid,
            ArqueoRecord.is_active == True,
        )
    )
    rec = rec_result.scalar_one_or_none()
    if rec:
        header = await arqueo_service.get_header(db, rec.arqueo_header_id)
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    return await service.edit_record(
        db=db,
        record_uid=record_uid,
        new_data=body.new_data,
        user_id=current_user.id,
        reason_id=body.reason_id,
        reason_detail=body.reason_detail,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post(
    "/records/{record_uid}/cancel",
    response_model=ArqueoRecordResponse,
    summary="Cancelar un registro de un arqueo publicado",
)
async def cancel_record(
    record_uid: str,
    body: CancelRecordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("etv")),
):
    from sqlalchemy import select
    from app.arqueos.models import ArqueoRecord
    rec_result = await db.execute(
        select(ArqueoRecord).where(
            ArqueoRecord.record_uid == record_uid,
            ArqueoRecord.is_active == True,
        )
    )
    rec = rec_result.scalar_one_or_none()
    if rec:
        header = await arqueo_service.get_header(db, rec.arqueo_header_id)
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    return await service.cancel_record(
        db=db,
        record_uid=record_uid,
        user_id=current_user.id,
        reason_id=body.reason_id,
        reason_detail=body.reason_detail,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.post(
    "/{header_id}/lock",
    response_model=ArqueoHeaderWithRecordsResponse,
    summary="Bloquear un arqueo (Admin / Operations)",
)
async def lock_arqueo(
    header_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "operations")),
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    return await service.lock_arqueo(
        db=db,
        header_id=header_id,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
