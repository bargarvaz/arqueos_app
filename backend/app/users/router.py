# -*- coding: utf-8 -*-
"""Router de gestión de usuarios (solo Admin)."""

from fastapi import APIRouter, Depends, Request, status, Query

from app.users import service as user_service
from app.users.schemas import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserDetailResponse,
    VaultAssignmentRequest,
    PasswordResetResponse,
    CompanyCreate,
    CompanyResponse,
)
from app.common.pagination import PaginationParams, PagedResponse
from app.dependencies import get_db, require_admin, get_current_user, DbSession, CurrentUser

router = APIRouter(prefix="/users", tags=["Usuarios"])

AdminUser = Depends(require_admin())


# ─── Usuarios ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=UserDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: Request,
    body: UserCreate,
    db: DbSession,
    admin=AdminUser,
):
    """Crea un nuevo usuario. Solo Admin. Retorna contraseña temporal separada."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    user, temp_password = await user_service.create_user(
        db,
        email=body.email,
        full_name=body.full_name,
        role=body.role,
        user_type=body.user_type,
        company_id=body.company_id,
        vault_ids=body.vault_ids,
        created_by_user_id=admin.id,
        ip_address=ip,
        user_agent=ua,
    )

    # La contraseña temporal se incluye en headers para que el Admin la vea (solo este request)
    from fastapi.responses import JSONResponse
    vault_ids = await user_service.get_user_assigned_vault_ids(db, user.id)
    response_data = UserDetailResponse.model_validate(user).model_dump()
    response_data["assigned_vault_ids"] = vault_ids
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=response_data,
        headers={"X-Temp-Password": temp_password},
    )


@router.get("/", response_model=PagedResponse[UserResponse])
async def list_users(
    db: DbSession,
    admin=AdminUser,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25),
    role: str | None = Query(default=None),
    user_type: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None),
):
    """Lista todos los usuarios con filtros y paginación."""
    params = PaginationParams(page=page, page_size=page_size)
    users, total = await user_service.list_users(
        db, params, role=role, user_type=user_type, is_active=is_active, search=search
    )
    return PagedResponse.build(users, total, params)


@router.get("/{user_id}", response_model=UserDetailResponse)
async def get_user(user_id: int, db: DbSession, admin=AdminUser):
    """Obtiene detalle de un usuario."""
    user = await user_service.get_user(db, user_id)
    vault_ids = await user_service.get_user_assigned_vault_ids(db, user_id)
    response = UserDetailResponse.model_validate(user)
    response.assigned_vault_ids = vault_ids
    return response


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    request: Request,
    user_id: int,
    body: UserUpdate,
    db: DbSession,
    admin=AdminUser,
):
    """Actualiza datos del usuario."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    user = await user_service.update_user(
        db,
        user_id,
        updated_by_user_id=admin.id,
        full_name=body.full_name,
        is_active=body.is_active,
        company_id=body.company_id,
        ip_address=ip,
        user_agent=ua,
    )
    return user


@router.post("/{user_id}/reset-password", response_model=PasswordResetResponse)
async def reset_password(
    request: Request,
    user_id: int,
    db: DbSession,
    admin=AdminUser,
):
    """Restablece la contraseña de un usuario. Solo Admin. Muestra temporal una sola vez."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    temp_password = await user_service.reset_password(
        db,
        target_user_id=user_id,
        admin_user_id=admin.id,
        ip_address=ip,
        user_agent=ua,
    )
    return PasswordResetResponse(temp_password=temp_password)


@router.put("/{user_id}/vaults", status_code=status.HTTP_204_NO_CONTENT)
async def assign_vaults(
    request: Request,
    user_id: int,
    body: VaultAssignmentRequest,
    db: DbSession,
    admin=AdminUser,
):
    """Asigna/reasigna bóvedas al usuario ETV. Solo Admin."""
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    await user_service.assign_vaults(
        db,
        user_id,
        body.vault_ids,
        admin_user_id=admin.id,
        ip_address=ip,
        user_agent=ua,
    )


# ─── Empresas ─────────────────────────────────────────────────────────────────

@router.post("/companies", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(body: CompanyCreate, db: DbSession, admin=AdminUser):
    """Crea una empresa ETV."""
    from app.users.models import Company
    company = Company(name=body.name)
    db.add(company)
    await db.commit()
    await db.refresh(company)
    return company


@router.get("/companies", response_model=list[CompanyResponse])
async def list_companies(db: DbSession, current_user=Depends(get_current_user)):
    """Lista todas las empresas activas."""
    from sqlalchemy import select
    from app.users.models import Company
    result = await db.execute(select(Company).where(Company.is_active == True).order_by(Company.name))
    return result.scalars().all()
