# -*- coding: utf-8 -*-
"""Configuración central del sistema usando Pydantic Settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import EmailStr


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ─── Base de datos ────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://arqueos_user:password@localhost:5432/arqueos"

    # ─── JWT ─────────────────────────────────────────────────────
    jwt_secret: str = "change_me_in_production"
    jwt_algorithm: str = "HS256"
    jwt_access_expire_minutes: int = 15
    jwt_refresh_expire_hours: int = 24

    # ─── OTP / Email ─────────────────────────────────────────────
    otp_email_host: str = "smtp.gmail.com"
    otp_email_port: int = 587
    otp_email_user: str = ""
    otp_email_password: str = ""
    otp_email_from: str = "Sistema Arqueos <noreply@arqueos.com>"
    otp_expire_minutes: int = 5
    otp_resend_cooldown_seconds: int = 60
    otp_max_resends_per_session: int = 3
    otp_lockout_minutes: int = 15

    # ─── MinIO ────────────────────────────────────────────────────
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minio_admin"
    minio_secret_key: str = "minio_password"
    minio_secure: bool = False
    minio_bucket_certificates: str = "certificates"

    # ─── Seguridad / CORS ────────────────────────────────────────
    frontend_origin: str = "http://localhost:80"
    environment: str = "development"

    # ─── Sesión ──────────────────────────────────────────────────
    session_inactivity_minutes: int = 60

    # ─── Zona horaria ─────────────────────────────────────────────
    timezone: str = "America/Mexico_City"

    # ─── Feature flags ────────────────────────────────────────────
    mfa_enabled: bool = True  # False → login ETV sin OTP (solo para pruebas)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def allowed_origins(self) -> list[str]:
        origins = [self.frontend_origin]
        if not self.is_production:
            origins += [
                "http://localhost:3000",
                "http://localhost:5173",
                "http://localhost:80",
            ]
        return origins


@lru_cache
def get_settings() -> Settings:
    """Retorna la instancia singleton de settings (cacheada)."""
    return Settings()


settings = get_settings()
