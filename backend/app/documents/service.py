# -*- coding: utf-8 -*-
"""
Servicio de gestión de certificados PDF.

Estructura MinIO:
    certificates/{company_name}/{vault_code}/{YYYY}/{MM}/{vault_code}_{YYYY-MM-DD}_{ts}.pdf
"""

import logging
import io
import re
from datetime import datetime, timezone
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.documents.models import Certificate
from app.arqueos.models import ArqueoHeader
from app.storage.minio_client import get_minio_client
from app.config import settings
from app.common.exceptions import NotFoundError, BusinessRuleError, ValidationAppError
from app.audit.service import log_action

logger = logging.getLogger(__name__)

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_CERTIFICATES_PER_ARQUEO = 10
ALLOWED_CONTENT_TYPES = {"application/pdf"}


_PATH_SAFE = re.compile(r"[^A-Za-z0-9_-]+")


def _sanitize_path_component(value: str, fallback: str = "x") -> str:
    """Whitelist estricta para componentes de ruta en MinIO.

    Reemplaza espacios por `_` y descarta cualquier otro caracter fuera del
    set `[A-Za-z0-9_-]`. Bloquea path traversal (`..`, `/`, control chars,
    unicode raro).
    """
    cleaned = _PATH_SAFE.sub("", value.replace(" ", "_")).strip("._-")
    return cleaned or fallback


def _build_minio_key(
    company_name: str,
    vault_code: str,
    arqueo_date,  # date object
    timestamp_str: str,
) -> str:
    """Construye la ruta del objeto en MinIO."""
    year = arqueo_date.strftime("%Y")
    month = arqueo_date.strftime("%m")
    safe_company = _sanitize_path_component(company_name, "company")
    safe_vault = _sanitize_path_component(vault_code, "vault")
    safe_ts = _sanitize_path_component(timestamp_str, "ts")
    filename = f"{safe_vault}_{arqueo_date}_{safe_ts}.pdf"
    return f"{safe_company}/{safe_vault}/{year}/{month}/{filename}"


async def upload_certificate(
    db: AsyncSession,
    header_id: int,
    file_content: bytes,
    original_filename: str,
    content_type: str,
    user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> Certificate:
    """
    Sube un certificado PDF a MinIO y registra la referencia en BD.
    Validaciones:
    - Solo PDF (application/pdf)
    - Máximo 10 MB
    - Máximo 10 certificados activos por arqueo
    """
    # Validar tipo
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise ValidationAppError("Solo se permiten archivos PDF.")

    # Validar tamaño
    if len(file_content) > MAX_FILE_SIZE_BYTES:
        raise ValidationAppError(
            f"El archivo excede el tamaño máximo de {MAX_FILE_SIZE_BYTES // (1024*1024)} MB."
        )

    # Obtener header
    header = await db.get(ArqueoHeader, header_id)
    if not header:
        raise NotFoundError("Arqueo")

    # Contar certificados activos
    count_result = await db.execute(
        select(Certificate).where(
            Certificate.arqueo_header_id == header_id,
            Certificate.is_active == True,
        )
    )
    existing = count_result.scalars().all()
    if len(existing) >= MAX_CERTIFICATES_PER_ARQUEO:
        # Disparar notificación a los Admin (no bloquea la respuesta)
        import asyncio as _asyncio
        _asyncio.create_task(
            _notify_excess_certificates_task(
                header_id=header_id,
                vault_id=header.vault_id,
                user_id=user_id,
            )
        )
        raise BusinessRuleError(
            f"Se alcanzó el máximo de {MAX_CERTIFICATES_PER_ARQUEO} certificados por arqueo."
        )

    # Obtener vault y company para construir la ruta
    from app.vaults.models import Vault
    from app.users.models import Company
    vault = await db.get(Vault, header.vault_id)
    if not vault:
        raise NotFoundError("Bóveda")

    company = await db.get(Company, vault.company_id)
    company_name = company.name if company else "unknown"

    ts = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    minio_key = _build_minio_key(
        company_name,
        vault.vault_code,
        header.arqueo_date,
        ts,
    )

    # Subir a MinIO
    client = get_minio_client()
    bucket = settings.minio_bucket_certificates

    client.put_object(
        bucket_name=bucket,
        object_name=minio_key,
        data=io.BytesIO(file_content),
        length=len(file_content),
        content_type=content_type,
    )
    logger.info("Certificado subido: bucket=%s key=%s", bucket, minio_key)

    # Registrar en BD
    cert = Certificate(
        arqueo_header_id=header_id,
        file_name=original_filename,
        minio_bucket=bucket,
        minio_key=minio_key,
        file_size_bytes=len(file_content),
        content_type=content_type,
        uploaded_by=user_id,
    )
    db.add(cert)
    await db.flush()

    await log_action(
        db,
        user_id=user_id,
        action="upload_certificate",
        entity_type="certificate",
        entity_id=cert.id,
        new_values={
            "file_name": original_filename,
            "minio_key": minio_key,
            "file_size_bytes": len(file_content),
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )

    await db.commit()
    await db.refresh(cert)
    return cert


async def get_certificate_download_url(
    db: AsyncSession,
    certificate_id: int,
    user_id: int,
) -> str:
    """
    Genera una URL pre-firmada para descarga directa desde MinIO.
    Expira en 15 minutos.

    Nota: el host de la URL apunta al endpoint configurado en el cliente MinIO,
    que en Docker es `minio:9000` y no es accesible desde el browser. Para
    descarga desde el frontend usa `stream_certificate` en su lugar.
    """
    cert = await db.get(Certificate, certificate_id)
    if not cert or not cert.is_active:
        raise NotFoundError("Certificado")

    from datetime import timedelta
    client = get_minio_client()
    url = client.presigned_get_object(
        bucket_name=cert.minio_bucket,
        object_name=cert.minio_key,
        expires=timedelta(minutes=15),
    )
    return url


async def stream_certificate(
    db: AsyncSession,
    certificate_id: int,
) -> tuple[bytes, str, str]:
    """
    Descarga el contenido del certificado desde MinIO y lo retorna en memoria
    junto con su nombre de archivo y content_type. Pensado para servir el PDF
    a través del backend (evita exponer el endpoint MinIO al browser).

    Para PDFs >10MB sería preferible streaming chunked, pero el límite del
    sistema es 10MB y MinIO get_object devuelve un response stream que el
    caller puede iterar si lo necesita en el futuro.
    """
    cert = await db.get(Certificate, certificate_id)
    if not cert or not cert.is_active:
        raise NotFoundError("Certificado")

    client = get_minio_client()
    response = client.get_object(
        bucket_name=cert.minio_bucket,
        object_name=cert.minio_key,
    )
    try:
        content = response.read()
    finally:
        response.close()
        response.release_conn()

    return content, cert.file_name, cert.content_type


async def list_certificates(
    db: AsyncSession,
    header_id: int,
) -> list[Certificate]:
    """Lista los certificados activos de un arqueo."""
    result = await db.execute(
        select(Certificate).where(
            Certificate.arqueo_header_id == header_id,
            Certificate.is_active == True,
        ).order_by(Certificate.uploaded_at.desc())
    )
    return list(result.scalars().all())


async def _notify_excess_certificates_task(
    header_id: int, vault_id: int, user_id: int
) -> None:
    """Tarea asíncrona: notifica a admin/operations cuando una ETV intenta el 11º PDF."""
    try:
        from app.database import AsyncSessionLocal
        from app.notifications.service import notify_excess_certificates
        async with AsyncSessionLocal() as db:
            await notify_excess_certificates(
                db, header_id=header_id, vault_id=vault_id, attempted_by=user_id
            )
    except Exception as exc:
        logger.warning("No se pudo enviar notify_excess_certificates: %s", exc)


async def delete_certificate(
    db: AsyncSession,
    certificate_id: int,
    user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    """Baja lógica del certificado (no elimina de MinIO)."""
    cert = await db.get(Certificate, certificate_id)
    if not cert or not cert.is_active:
        raise NotFoundError("Certificado")

    cert.is_active = False

    await log_action(
        db,
        user_id=user_id,
        action="delete_certificate",
        entity_type="certificate",
        entity_id=cert.id,
        old_values={"file_name": cert.file_name, "minio_key": cert.minio_key},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    await db.commit()
