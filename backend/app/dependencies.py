# -*- coding: utf-8 -*-
"""Dependencias inyectables de FastAPI: sesión DB, usuario actual, permisos."""

from typing import AsyncGenerator, Annotated
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.config import settings


# ─── Sesión de base de datos ──────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Genera una sesión de BD por request y la cierra al terminar."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


DbSession = Annotated[AsyncSession, Depends(get_db)]

# ─── Autenticación JWT ────────────────────────────────────────────────────────

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    db: DbSession,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    """Valida JWT del header Authorization y retorna el usuario activo."""
    from app.auth.utils import decode_access_token
    from app.users.models import User

    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales no proporcionadas.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido o expirado.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id: int = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario no encontrado o inactivo.",
        )

    return user


CurrentUser = Annotated[object, Depends(get_current_user)]


# ─── Guards de rol ────────────────────────────────────────────────────────────

def require_roles(*roles: str):
    """Factory que retorna una dependencia que valida que el usuario tenga uno de los roles dados."""
    async def role_checker(current_user=Depends(get_current_user)):
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No tienes permisos para realizar esta acción.",
            )
        return current_user
    return role_checker


def require_admin():
    return require_roles("admin")


def require_internal():
    return require_roles("admin", "operations", "data_science")


def require_etv():
    return require_roles("etv")
