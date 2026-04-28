# -*- coding: utf-8 -*-
"""Router de gestión de usuarios (solo Admin)."""

from fastapi import APIRouter, Depends, Request, status, Query, UploadFile, File

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
    EmpresaCreate,
    EmpresaUpdate,
    EmpresaResponse,
)
from app.common.pagination import PaginationParams, PagedResponse
from app.dependencies import get_db, require_admin, get_current_user, DbSession, CurrentUser

router = APIRouter(prefix="/users", tags=["Usuarios"])

AdminUser = Depends(require_admin())


# ─── ETVs (rutas específicas ANTES que /{user_id}) ───────────────────────────

@router.get("/companies", response_model=list[CompanyResponse])
async def list_companies(
    db: DbSession,
    current_user=Depends(get_current_user),
    include_inactive: bool = Query(default=False),
):
    """Lista ETVs. Sin filtro de inactivos por defecto."""
    from sqlalchemy import select
    from app.users.models import Company
    q = select(Company).order_by(Company.name)
    if not include_inactive:
        q = q.where(Company.is_active == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/companies", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
async def create_company(body: CompanyCreate, db: DbSession, admin=AdminUser):
    """Crea una ETV."""
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError
    from app.users.models import Company
    from fastapi import HTTPException
    existing = await db.execute(select(Company).where(Company.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Ya existe una ETV con el nombre '{body.name}'.")
    company = Company(name=body.name)
    db.add(company)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail=f"Ya existe una ETV con el nombre '{body.name}'.")
    await db.refresh(company)
    return company


@router.patch("/companies/{company_id}/toggle", response_model=CompanyResponse)
async def toggle_company(company_id: int, db: DbSession, admin=AdminUser):
    """Activa o desactiva una ETV."""
    from sqlalchemy import select
    from app.users.models import Company
    from fastapi import HTTPException
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="ETV no encontrada.")
    company.is_active = not company.is_active
    await db.commit()
    await db.refresh(company)
    return company


@router.patch("/companies/{company_id}", response_model=CompanyResponse)
async def update_company(company_id: int, body: CompanyCreate, db: DbSession, admin=AdminUser):
    """Actualiza nombre de una ETV."""
    from sqlalchemy import select
    from app.users.models import Company
    from fastapi import HTTPException
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="ETV no encontrada.")
    if body.name is not None:
        company.name = body.name
    await db.commit()
    await db.refresh(company)
    return company


# ─── Sub-empresas (rutas específicas ANTES que /{user_id}) ───────────────────

@router.get("/empresas", response_model=list[EmpresaResponse])
async def list_empresas(
    db: DbSession,
    current_user=Depends(get_current_user),
    etv_id: int | None = Query(default=None),
    include_inactive: bool = Query(default=False),
):
    """Lista sub-empresas, opcionalmente filtradas por ETV."""
    from sqlalchemy import select
    from app.users.models import Empresa
    q = select(Empresa).order_by(Empresa.name)
    if etv_id:
        q = q.where(Empresa.etv_id == etv_id)
    if not include_inactive:
        q = q.where(Empresa.is_active == True)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/empresas", response_model=EmpresaResponse, status_code=status.HTTP_201_CREATED)
async def create_empresa(body: EmpresaCreate, db: DbSession, admin=AdminUser):
    """Crea una sub-empresa dentro de una ETV."""
    from sqlalchemy import select
    from sqlalchemy.exc import IntegrityError
    from app.users.models import Empresa
    from fastapi import HTTPException
    existing = await db.execute(
        select(Empresa).where(Empresa.name == body.name, Empresa.etv_id == body.etv_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Ya existe una empresa con ese nombre en la ETV seleccionada.")
    empresa = Empresa(name=body.name, etv_id=body.etv_id)
    db.add(empresa)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Error al crear la empresa.")
    await db.refresh(empresa)
    return empresa


@router.patch("/empresas/{empresa_id}/toggle", response_model=EmpresaResponse)
async def toggle_empresa(empresa_id: int, db: DbSession, admin=AdminUser):
    """Activa o desactiva una sub-empresa."""
    from sqlalchemy import select
    from app.users.models import Empresa
    from fastapi import HTTPException
    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")
    empresa.is_active = not empresa.is_active
    await db.commit()
    await db.refresh(empresa)
    return empresa


@router.patch("/empresas/{empresa_id}", response_model=EmpresaResponse)
async def update_empresa(empresa_id: int, body: EmpresaUpdate, db: DbSession, admin=AdminUser):
    """Actualiza nombre o ETV de una sub-empresa."""
    from sqlalchemy import select
    from app.users.models import Empresa
    from fastapi import HTTPException
    result = await db.execute(select(Empresa).where(Empresa.id == empresa_id))
    empresa = result.scalar_one_or_none()
    if not empresa:
        raise HTTPException(status_code=404, detail="Empresa no encontrada.")
    if body.name is not None:
        empresa.name = body.name
    if body.etv_id is not None:
        empresa.etv_id = body.etv_id
    await db.commit()
    await db.refresh(empresa)
    return empresa


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
        company_id=body.company_id,
        empresa_id=body.empresa_id,
        puesto=body.puesto,
        etv_subrole=body.etv_subrole,
        vault_ids=body.vault_ids,
        created_by_user_id=admin.id,
        ip_address=ip,
        user_agent=ua,
    )

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
    _=Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25),
    role: str | None = Query(default=None),
    user_type: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    search: str | None = Query(default=None),
):
    """Lista usuarios con filtros y paginación. Accesible a todos los usuarios autenticados."""
    params = PaginationParams(page=page, page_size=page_size)
    users, total = await user_service.list_users(
        db, params, role=role, user_type=user_type, is_active=is_active, search=search
    )
    return PagedResponse.build(users, total, params)


# ─── Rutas con /{user_id} AL FINAL para no capturar rutas específicas ─────────

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
        puesto=body.puesto,
        is_active=body.is_active,
        company_id=body.company_id,
        empresa_id=body.empresa_id,
        etv_subrole=body.etv_subrole,
        fields_set=body.model_fields_set,
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
    """Restablece la contraseña de un usuario. Solo Admin."""
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


@router.get("/bulk-import/template", response_class=None)
async def get_users_csv_template(_=AdminUser):
    """Plantilla CSV vacía para importación masiva."""
    from fastapi.responses import Response
    from app.users.bulk_import import csv_template
    return Response(
        content=csv_template(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=usuarios_template.csv"},
    )


@router.post("/bulk-import/preview")
async def preview_users_import(
    db: DbSession,
    file: UploadFile = File(...),
    _=AdminUser,
):
    """Lee el CSV y devuelve un preview con errores por fila. NO crea nada."""
    from app.users.bulk_import import parse_csv, validate_and_preview
    content = await file.read()
    rows, format_errors = parse_csv(content)
    if format_errors:
        return {
            "format_errors": format_errors,
            "items": [],
            "valid": 0,
            "invalid": 0,
        }
    return await validate_and_preview(db, rows)


@router.post("/bulk-import/apply")
async def apply_users_import(
    request: Request,
    db: DbSession,
    file: UploadFile = File(...),
    admin=AdminUser,
):
    """Aplica el import. Falla si hay cualquier fila con error (transacción por fila)."""
    from app.users.bulk_import import parse_csv, validate_and_preview, apply_import
    content = await file.read()
    rows, format_errors = parse_csv(content)
    if format_errors:
        return {
            "format_errors": format_errors,
            "applied": False,
            "created": 0,
            "failed": 0,
            "results": [],
        }
    preview = await validate_and_preview(db, rows)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return await apply_import(db, preview, admin.id, ip, ua)


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
