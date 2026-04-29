# -*- coding: utf-8 -*-
"""Helpers para tareas en background (fire-and-forget seguro)."""

import asyncio
import logging
from typing import Coroutine, Any

logger = logging.getLogger(__name__)

# Mantenemos referencias fuertes a las tareas pendientes para que el GC no
# las cancele antes de tiempo (https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task)
_PENDING: set[asyncio.Task[Any]] = set()


def fire_and_forget(coro: Coroutine[Any, Any, Any], *, name: str | None = None) -> asyncio.Task[Any]:
    """Lanza una corutina como tarea de fondo con tres garantías:

    1. Mantiene una referencia fuerte hasta que termine (evita GC prematuro).
    2. Cualquier excepción se loguea (no se pierde silenciosamente).
    3. Devuelve el `Task` por si el llamador quiere `.cancel()`.
    """
    task = asyncio.create_task(coro, name=name)
    _PENDING.add(task)

    def _on_done(t: asyncio.Task[Any]) -> None:
        _PENDING.discard(t)
        if t.cancelled():
            return
        exc = t.exception()
        if exc is not None:
            logger.exception(
                "Tarea de fondo '%s' falló: %s",
                t.get_name(),
                exc,
            )

    task.add_done_callback(_on_done)
    return task
