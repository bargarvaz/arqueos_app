# -*- coding: utf-8 -*-
"""Servicio de auditoría: escritura al audit_log."""

from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.models import AuditLog


async def log_action(
    db: AsyncSession,
    *,
    user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    old_values: dict[str, Any] | None = None,
    new_values: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    """
    Crea un registro en audit_log.

    Args:
        db: Sesión async de SQLAlchemy (debe ser flushed por el caller).
        user_id: ID del usuario que ejecutó la acción (None = sistema).
        action: Ej: 'login', 'create', 'update', 'delete', 'publish', 'download'.
        entity_type: Ej: 'user', 'arqueo_record', 'vault'.
        entity_id: ID de la entidad afectada.
        old_values: Snapshot antes del cambio.
        new_values: Snapshot después del cambio (o filtros en descargas).
        ip_address: IP del cliente.
        user_agent: User-agent del cliente.
    """
    entry = AuditLog(
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        old_values=old_values,
        new_values=new_values,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(entry)
    await db.flush()
    return entry
