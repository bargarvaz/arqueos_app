# -*- coding: utf-8 -*-
"""
Job diario de bloqueo: marca como `locked` los arqueos publicados cuyo
periodo de gracia ya expiró (último día hábil del mes M+1).

Uso desde CLI:
    python -m app.jobs.lock_expired_arqueos_job
"""

import asyncio
import logging
from datetime import date, datetime, timezone

from sqlalchemy import select

logger = logging.getLogger(__name__)


async def run_lock_expired_arqueos(target_date: date | None = None) -> int:
    """
    Recorre los headers en estado published y bloquea aquellos cuyo deadline
    de gracia es anterior a target_date (hoy por defecto).

    Retorna la cantidad de headers bloqueados.
    """
    from app.database import AsyncSessionLocal
    from app.arqueos.models import ArqueoHeader, ArqueoStatus
    from app.modifications.service import get_grace_deadline

    if target_date is None:
        target_date = date.today()

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(ArqueoHeader).where(ArqueoHeader.status == ArqueoStatus.published)
            )
            published = result.scalars().all()

            # Cache por (year, month) para evitar consultar holidays N veces
            deadline_cache: dict[tuple[int, int], date] = {}
            locked_count = 0
            now = datetime.now(timezone.utc)

            for header in published:
                key = (header.arqueo_date.year, header.arqueo_date.month)
                if key not in deadline_cache:
                    deadline_cache[key] = await get_grace_deadline(db, header.arqueo_date)
                deadline = deadline_cache[key]

                # Si ya pasó el deadline, bloquear
                if deadline < target_date:
                    header.status = ArqueoStatus.locked
                    header.locked_at = now
                    locked_count += 1

            if locked_count:
                await db.commit()
                logger.info(
                    "Job lock_expired: %d arqueos bloqueados (target_date=%s).",
                    locked_count, target_date,
                )
            else:
                logger.info(
                    "Job lock_expired: ningún arqueo cumple criterio (target_date=%s).",
                    target_date,
                )

            return locked_count

        except Exception as exc:
            logger.error("Error en job lock_expired: %s", exc)
            raise


def schedule_lock_job(scheduler) -> None:
    """
    Agrega el job al scheduler de APScheduler ya inicializado.
    Cron: 22:30 CDMX (30 min después del missing_arqueo_job).
    """
    try:
        from apscheduler.triggers.cron import CronTrigger
        import pytz

        tz = pytz.timezone("America/Mexico_City")
        scheduler.add_job(
            run_lock_expired_arqueos,
            trigger=CronTrigger(hour=22, minute=30, timezone=tz),
            id="lock_expired_daily",
            replace_existing=True,
        )
        logger.info(
            "Scheduler: job lock_expired programado a las 22:30 CDMX."
        )
    except ImportError:
        logger.warning("APScheduler no disponible: lock_expired_job no se programó.")


if __name__ == "__main__":
    asyncio.run(run_lock_expired_arqueos())
