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

    yield

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


# ─── Health check ─────────────────────────────────────────────────────────────
@app.get("/health", tags=["Sistema"])
async def health_check():
    """Endpoint de salud para Docker healthcheck."""
    return {"status": "ok", "environment": settings.environment}
