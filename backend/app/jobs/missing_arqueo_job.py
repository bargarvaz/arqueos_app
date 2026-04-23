# -*- coding: utf-8 -*-
"""
Job diario: detecta bóvedas activas sin arqueo a las 22:00 CDMX
y genera notificaciones missing_arqueo.

Uso desde CLI:
    python -m app.jobs.missing_arqueo_job

O integrado con APScheduler (ver main.py o un scheduler externo).
"""

import asyncio
import logging
from datetime import date

logger = logging.getLogger(__name__)


async def run_missing_arqueo_check(target_date: date | None = None) -> None:
    """
    Detecta bóvedas activas sin arqueo publicado en target_date y
    genera notificaciones missing_arqueo para Operations y Admin.
    """
    from app.database import AsyncSessionLocal
    from app.dashboard.service import get_missing_vaults
    from app.notifications.service import notify_missing_arqueo
    from app.arqueos.service import _check_holiday

    if target_date is None:
        target_date = date.today()

    async with AsyncSessionLocal() as db:
        try:
            missing = await get_missing_vaults(db, target_date=target_date)
            logger.info(
                "Job missing_arqueo: %d bóvedas sin arqueo al %s",
                len(missing),
                target_date,
            )

            for vault in missing:
                await notify_missing_arqueo(
                    db,
                    vault_code=vault["vault_code"],
                    vault_id=vault["vault_id"],
                    target_date=target_date,
                )

            await db.commit()
            logger.info("Job missing_arqueo completado — %d notificaciones generadas.", len(missing))

        except Exception as exc:
            logger.error("Error en job missing_arqueo: %s", exc)
            raise


def schedule_job() -> None:
    """
    Configura el job en APScheduler.
    Debe llamarse desde el lifespan de FastAPI.
    """
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger
        import pytz

        scheduler = AsyncIOScheduler()
        tz = pytz.timezone("America/Mexico_City")

        scheduler.add_job(
            run_missing_arqueo_check,
            trigger=CronTrigger(hour=22, minute=0, timezone=tz),
            id="missing_arqueo_daily",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("Scheduler iniciado — job missing_arqueo programado a las 22:00 CDMX.")
        return scheduler

    except ImportError:
        logger.warning(
            "APScheduler no instalado. El job missing_arqueo no se ejecutará automáticamente. "
            "Instala: pip install apscheduler pytz"
        )
        return None


if __name__ == "__main__":
    asyncio.run(run_missing_arqueo_check())
