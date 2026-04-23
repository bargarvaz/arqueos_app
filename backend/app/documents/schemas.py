# -*- coding: utf-8 -*-
"""Schemas Pydantic del módulo de documentos."""

from datetime import datetime
from pydantic import BaseModel


class CertificateResponse(BaseModel):
    id: int
    arqueo_header_id: int
    file_name: str
    minio_bucket: str
    minio_key: str
    file_size_bytes: int | None
    content_type: str
    is_active: bool
    uploaded_by: int
    uploaded_at: datetime

    model_config = {"from_attributes": True}
