# -*- coding: utf-8 -*-
"""Router del módulo de documentos (certificados PDF)."""

import io
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_user, require_roles
from app.users.models import User
from app.documents.schemas import CertificateResponse
from app.documents import service
from app.arqueos.service import get_header
from app.common.exceptions import ForbiddenError

router = APIRouter(prefix="/documents", tags=["Documentos"])


@router.get(
    "/arqueos/{header_id}/certificates",
    response_model=list[CertificateResponse],
    summary="Listar certificados de un arqueo",
)
async def list_certificates(
    header_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    header = await get_header(db, header_id)
    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    return await service.list_certificates(db, header_id)


@router.post(
    "/arqueos/{header_id}/certificates",
    response_model=CertificateResponse,
    status_code=201,
    summary="Subir certificado PDF a un arqueo",
)
async def upload_certificate(
    header_id: int,
    file: UploadFile = File(...),
    request: Request = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    header = await get_header(db, header_id)
    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    content = await file.read()
    ip_address = request.client.host if request and request.client else None
    user_agent = request.headers.get("User-Agent") if request else None

    return await service.upload_certificate(
        db=db,
        header_id=header_id,
        file_content=content,
        original_filename=file.filename or "certificate.pdf",
        content_type=file.content_type or "application/pdf",
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )


@router.get(
    "/certificates/{certificate_id}/download",
    summary="Descarga el certificado PDF (streaming desde MinIO vía backend)",
)
async def download_certificate(
    certificate_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Devuelve el archivo directamente. Antes se generaba una URL pre-firmada de
    MinIO, pero el host (`minio:9000`) no es resoluble desde el browser, así
    que el backend hace de proxy.

    ETV solo puede descargar certificados de sus bóvedas asignadas.
    """
    from app.documents.models import Certificate
    from app.common.exceptions import NotFoundError

    cert = await db.get(Certificate, certificate_id)
    if not cert or not cert.is_active:
        raise NotFoundError("Certificado")

    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        header = await get_header(db, cert.arqueo_header_id)
        await _verify_vault_assignment(db, current_user.id, header.vault_id)

    content, file_name, content_type = await service.stream_certificate(
        db, certificate_id
    )

    # Codificar el filename para soportar acentos/espacios sin romper el header
    safe_name = quote(file_name)
    return StreamingResponse(
        io.BytesIO(content),
        media_type=content_type or "application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{file_name}"; filename*=UTF-8\'\'{safe_name}'
            ),
            "Content-Length": str(len(content)),
        },
    )


@router.delete(
    "/certificates/{certificate_id}",
    status_code=204,
    summary="Eliminar (baja lógica) un certificado",
)
async def delete_certificate(
    certificate_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")

    await service.delete_certificate(
        db=db,
        certificate_id=certificate_id,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
