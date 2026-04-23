# -*- coding: utf-8 -*-
"""Router de bóvedas, sucursales y personal."""

from fastapi import APIRouter, Depends, Request, Query, status

from app.vaults import service as vault_service
from app.vaults.schemas import (
    VaultCreate, VaultUpdate, VaultResponse, SetInitialBalanceRequest,
    BranchCreate, BranchUpdate, BranchResponse,
    PersonnelCreate, PersonnelUpdate, PersonnelResponse,
)
from app.common.pagination import PaginationParams, PagedResponse
from app.dependencies import require_admin, get_current_user, DbSession

router = APIRouter(prefix="/vaults", tags=["Bóvedas"])

AdminUser = Depends(require_admin())


# ─── Bóvedas ─────────────────────────────────────────────────────────────────

@router.post("/", response_model=VaultResponse, status_code=status.HTTP_201_CREATED)
async def create_vault(
    request: Request, body: VaultCreate, db: DbSession, admin=AdminUser
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return await vault_service.create_vault(
        db,
        vault_code=body.vault_code,
        vault_name=body.vault_name,
        company_id=body.company_id,
        branch_id=body.branch_id,
        manager_id=body.manager_id,
        treasurer_id=body.treasurer_id,
        initial_balance=body.initial_balance,
        admin_user_id=admin.id,
        ip_address=ip,
        user_agent=ua,
    )


@router.get("/", response_model=PagedResponse[VaultResponse])
async def list_vaults(
    db: DbSession,
    _=Depends(get_current_user),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25),
    include_inactive: bool = Query(default=False),
    company_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
):
    params = PaginationParams(page=page, page_size=page_size)
    vaults, total = await vault_service.list_vaults(
        db, params, include_inactive=include_inactive, company_id=company_id, search=search
    )
    return PagedResponse.build(vaults, total, params)


@router.get("/{vault_id}", response_model=VaultResponse)
async def get_vault(vault_id: int, db: DbSession, _=Depends(get_current_user)):
    return await vault_service.get_vault(db, vault_id)


@router.patch("/{vault_id}", response_model=VaultResponse)
async def update_vault(
    request: Request, vault_id: int, body: VaultUpdate, db: DbSession, admin=AdminUser
):
    return await vault_service.update_vault(
        db,
        vault_id,
        admin_user_id=admin.id,
        **{k: v for k, v in body.model_dump().items() if v is not None},
    )


@router.post("/{vault_id}/deactivate", response_model=VaultResponse)
async def deactivate_vault(
    request: Request, vault_id: int, db: DbSession, admin=AdminUser
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return await vault_service.deactivate_vault(db, vault_id, admin.id, ip, ua)


@router.post("/{vault_id}/reactivate", response_model=VaultResponse)
async def reactivate_vault(
    request: Request,
    vault_id: int,
    body: SetInitialBalanceRequest,
    db: DbSession,
    admin=AdminUser,
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return await vault_service.reactivate_vault(
        db, vault_id, body.initial_balance, admin.id, ip, ua
    )


@router.put("/{vault_id}/initial-balance", response_model=VaultResponse)
async def set_initial_balance(
    request: Request,
    vault_id: int,
    body: SetInitialBalanceRequest,
    db: DbSession,
    admin=AdminUser,
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return await vault_service.set_initial_balance(
        db, vault_id, body.initial_balance, admin.id, ip, ua
    )


# ─── Sucursales ───────────────────────────────────────────────────────────────

@router.get("/branches/list", response_model=list[BranchResponse])
async def list_branches(
    db: DbSession,
    _=Depends(get_current_user),
    include_inactive: bool = Query(default=False),
    search: str | None = Query(default=None),
):
    return await vault_service.list_branches(db, include_inactive, search)


@router.post(
    "/branches", response_model=BranchResponse, status_code=status.HTTP_201_CREATED
)
async def create_branch(body: BranchCreate, db: DbSession, admin=AdminUser):
    return await vault_service.create_branch(db, body.name)


@router.patch("/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id: int, body: BranchUpdate, db: DbSession, admin=AdminUser
):
    return await vault_service.update_branch(
        db, branch_id, name=body.name, is_active=body.is_active
    )


# ─── Personal ─────────────────────────────────────────────────────────────────

@router.get("/personnel/list", response_model=list[PersonnelResponse])
async def list_personnel(
    db: DbSession,
    _=Depends(get_current_user),
    personnel_type: str | None = Query(default=None),
    include_inactive: bool = Query(default=False),
    search: str | None = Query(default=None),
):
    return await vault_service.list_personnel(
        db, personnel_type=personnel_type, include_inactive=include_inactive, search=search
    )


@router.post(
    "/personnel", response_model=PersonnelResponse, status_code=status.HTTP_201_CREATED
)
async def create_personnel(body: PersonnelCreate, db: DbSession, admin=AdminUser):
    return await vault_service.create_personnel(
        db, body.full_name, body.position, body.personnel_type
    )


@router.patch("/personnel/{person_id}", response_model=PersonnelResponse)
async def update_personnel(
    person_id: int, body: PersonnelUpdate, db: DbSession, admin=AdminUser
):
    return await vault_service.update_personnel(
        db, person_id, full_name=body.full_name, position=body.position, is_active=body.is_active
    )
