# -*- coding: utf-8 -*-
"""Entry point de la aplicación FastAPI — Sistema de Gestión de Arqueos Bancarios."""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI

from app.config import settings
from app.common.exceptions import register_exception_handlers
from app.common.security import configure_cors, configure_rate_limiting, configure_security_headers

# Routers — se importan aquí para registro
from app.auth.router import router as auth_router
from app.users.router import router as users_router
from app.catalogs.router import router as catalogs_router
from app.vaults.router import router as vaults_router
from app.arqueos.router import router as arqueos_router
from app.modifications.router import router as modifications_router
from app.documents.router import router as documents_router
from app.dashboard.router import router as dashboard_router
from app.reports.router import router as reports_router
from app.notifications.router import router as notifications_router
from app.error_reports.router import router as error_reports_router
from app.arqueos.explorer_router import router as explorer_router
from app.audit.router import router as audit_router

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.DEBUG if not settings.is_production else logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown del servidor."""
    logger.info("Iniciando Sistema de Arqueos — entorno: %s", settings.environment)

    # Inicializar bucket MinIO
    try:
        from app.storage.minio_client import init_minio_buckets
        await init_minio_buckets()
    except Exception as exc:
        logger.warning("No se pudo inicializar MinIO: %s", exc)

    # Scheduler de jobs
    scheduler = None
    try:
        from app.jobs.missing_arqueo_job import schedule_job
        scheduler = schedule_job()
        if scheduler:
            from app.jobs.lock_expired_arqueos_job import schedule_lock_job
            schedule_lock_job(scheduler)
    except Exception as exc:
        logger.warning("No se pudo iniciar el scheduler: %s", exc)

    yield

    if scheduler:
        scheduler.shutdown()
    logger.info("Cerrando servidor.")


app = FastAPI(
    title="Sistema de Gestión de Arqueos Bancarios",
    description="API REST para el registro, validación y consulta de arqueos de bóvedas bancarias.",
    version="1.0.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url="/redoc" if not settings.is_production else None,
    openapi_url="/openapi.json" if not settings.is_production else None,
    lifespan=lifespan,
)

# ─── Middlewares y configuración de seguridad ────────────────────────────────
configure_security_headers(app)
configure_cors(app)
configure_rate_limiting(app)
register_exception_handlers(app)

# ─── Routers ─────────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)
app.include_router(catalogs_router, prefix=API_PREFIX)
app.include_router(vaults_router, prefix=API_PREFIX)
app.include_router(arqueos_router, prefix=API_PREFIX)
app.include_router(modifications_router, prefix=API_PREFIX)
app.include_router(documents_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)
app.include_router(reports_router, prefix=API_PREFIX)
app.include_router(notifications_router, prefix=API_PREFIX)
app.include_router(error_reports_router, prefix=API_PREFIX)
app.include_router(explorer_router, prefix=API_PREFIX)
app.include_router(audit_router, prefix=API_PREFIX)


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Sistema"])
async def health_check():
    """Endpoint de salud para Docker healthcheck."""
    return {"status": "ok", "environment": settings.environment}
