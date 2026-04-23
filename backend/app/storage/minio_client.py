# -*- coding: utf-8 -*-
"""Cliente MinIO para gestión de certificados PDF."""

import logging
from minio import Minio
from minio.error import S3Error

from app.config import settings

logger = logging.getLogger(__name__)

_minio_client: Minio | None = None


def get_minio_client() -> Minio:
    """Retorna el cliente MinIO singleton."""
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
    return _minio_client


async def init_minio_buckets() -> None:
    """Crea los buckets necesarios si no existen."""
    client = get_minio_client()
    bucket = settings.minio_bucket_certificates

    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("Bucket '%s' creado en MinIO.", bucket)
    else:
        logger.info("Bucket '%s' ya existe en MinIO.", bucket)
