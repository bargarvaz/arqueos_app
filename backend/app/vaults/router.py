# -*- coding: utf-8 -*-
"""Router de bóvedas y sucursales.

IMPORTANTE: Las rutas específicas (/branches/*, /bulk-import/*) deben ir
ANTES de /{vault_id} para que FastAPI no las capture como int.
"""

from datetime import date

from fastapi import APIRouter, Depends, Request, Query, UploadFile, File, status
from fastapi.responses import Response

from app.vaults import service as vault_service
from app.vaults.schemas import (
    VaultCreate, VaultUpdate, VaultResponse, SetInitialBalanceRequest,
    ReactivateVaultRequest,
    BranchCreate, BranchUpdate, BranchResponse,
)
from app.common.pagination import PaginationParams, PagedResponse
from app.dependencies import require_admin, require_roles, get_current_user, DbSession

router = APIRouter(prefix="/vaults", tags=["Bóvedas"])

AdminUser = Depends(require_admin())


# ─── Sucursales (ANTES de /{vault_id}) ───────────────────────────────────────

@router.get("/branches/list", response_model=list[BranchResponse])
async def list_branches(
    db: DbSession,
    _=Depends(get_current_user),
    include_inactive: bool = Query(default=False),
    search: str | None = Query(default=None),
):
    return await vault_service.list_branches(db, include_inactive, search)


@router.post("/branches", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
async def create_branch(body: BranchCreate, db: DbSession, admin=AdminUser):
    return await vault_service.create_branch(db, body.name)


@router.patch("/branches/{branch_id}", response_model=BranchResponse)
async def update_branch(branch_id: int, body: BranchUpdate, db: DbSession, admin=AdminUser):
    return await vault_service.update_branch(
        db, branch_id, name=body.name, is_active=body.is_active
    )


# ─── Bóvedas: bulk import ──────────────────────────────────────────────────────

@router.get("/bulk-import/template")
async def get_vaults_csv_template(_=AdminUser):
    """Plantilla CSV vacía para importación masiva."""
    from app.vaults.bulk_import import csv_template
    return Response(
        content=csv_template(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bovedas_template.csv"},
    )


@router.post("/bulk-import/preview")
async def preview_vaults_import(
    db: DbSession,
    file: UploadFile = File(...),
    _=AdminUser,
):
    from app.vaults.bulk_import import parse_csv, validate_and_preview
    content = await file.read()
    rows, format_errors = parse_csv(content)
    if format_errors:
        return {
            "format_errors": format_errors,
            "items": [], "valid": 0, "invalid": 0,
        }
    return await validate_and_preview(db, rows)


@router.post("/bulk-import/apply")
async def apply_vaults_import(
    request: Request,
    db: DbSession,
    file: UploadFile = File(...),
    admin=AdminUser,
):
    from app.vaults.bulk_import import parse_csv, validate_and_preview, apply_import
    content = await file.read()
    rows, format_errors = parse_csv(content)
    if format_errors:
        return {
            "format_errors": format_errors,
            "applied": False, "created": 0, "failed": 0, "results": [],
        }
    preview = await validate_and_preview(db, rows)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return await apply_import(db, preview, admin.id, ip, ua)


# ─── Bóvedas ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=VaultResponse, status_code=status.HTTP_201_CREATED)
async def create_vault(
    request: Request, body: VaultCreate, db: DbSession, admin=AdminUser
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    initial_denoms = (
        body.initial_denominations.model_dump() if body.initial_denominations else None
    )
    return await vault_service.create_vault(
        db,
        vault_code=body.vault_code,
        vault_name=body.vault_name,
        company_id=body.company_id,
        empresa_id=body.empresa_id,
        manager_id=body.manager_id,
        treasurer_id=body.treasurer_id,
        initial_denominations=initial_denoms,
        admin_user_id=admin.id,
        ip_address=ip,
        user_agent=ua,
    )


@router.get("/", response_model=PagedResponse[VaultResponse])
async def list_vaults(
    db: DbSession,
    # Solo roles internos pueden listar todas las bóvedas. ETV consulta
    # `/arqueos/my-vaults` que devuelve solo las asignadas.
    _=Depends(require_roles("admin", "operations", "data_science")),
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

    # Enriquecer con saldo actual (último closing publicado, fallback initial_balance)
    balances = await vault_service.get_current_balances(db, [v.id for v in vaults])
    items = []
    for v in vaults:
        item = VaultResponse.model_validate(v)
        item.current_balance = balances.get(v.id, v.initial_balance)
        items.append(item)
    return PagedResponse.build(items, total, params)


# ─── Rutas con /{vault_id} AL FINAL ──────────────────────────────────────────

@router.get("/{vault_id}", response_model=VaultResponse)
async def get_vault(
    vault_id: int,
    db: DbSession,
    current_user=Depends(get_current_user),
):
    # ETV solo puede ver el detalle de bóvedas que tiene asignadas
    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, vault_id)

    vault = await vault_service.get_vault(db, vault_id)
    balances = await vault_service.get_current_balances(db, [vault.id])
    item = VaultResponse.model_validate(vault)
    item.current_balance = balances.get(vault.id, vault.initial_balance)
    return item


@router.patch("/{vault_id}", response_model=VaultResponse)
async def update_vault(
    request: Request, vault_id: int, body: VaultUpdate, db: DbSession, admin=AdminUser
):
    """
    Actualiza datos de la bóveda. Si llega `initial_denominations`, recalcula
    initial_balance y las columnas de denominaciones.
    """
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    payload = body.model_dump(exclude_unset=True)

    initial_denoms = payload.pop("initial_denominations", None)
    if initial_denoms is not None:
        await vault_service.update_vault_denominations(
            db, vault_id, initial_denoms, admin.id, ip, ua
        )

    if payload:
        return await vault_service.update_vault(
            db, vault_id, admin_user_id=admin.id, **payload,
        )

    # Solo se actualizaron denominaciones: devolver bóveda actualizada
    vault = await vault_service.get_vault(db, vault_id)
    balances = await vault_service.get_current_balances(db, [vault.id])
    item = VaultResponse.model_validate(vault)
    item.current_balance = balances.get(vault.id, vault.initial_balance)
    return item


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
    body: ReactivateVaultRequest,
    db: DbSession,
    admin=AdminUser,
):
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    denoms = (
        body.initial_denominations.model_dump() if body.initial_denominations else None
    )
    return await vault_service.reactivate_vault(
        db,
        vault_id,
        body.initial_balance,
        denoms,
        admin.id,
        manager_id=body.manager_id,
        treasurer_id=body.treasurer_id,
        ip_address=ip,
        user_agent=ua,
    )


@router.get("/{vault_id}/denomination-inventory")
async def get_denomination_inventory(
    vault_id: int,
    db: DbSession,
    current_user=Depends(get_current_user),
    target_date: date | None = Query(default=None, alias="date"),
):
    """
    Devuelve el inventario disponible por denominación al inicio de `date`
    (default: hoy). ETV solo si tiene la bóveda asignada.

    Si la bóveda está "sin migrar" (initial_balance > 0 y denominaciones=0),
    retorna `unmigrated: true` y un dict de ceros, para que el frontend muestre
    un banner sin bloquear.
    """
    from app.arqueos.service import get_denomination_inventory as _get_inv
    target = target_date or date.today()

    if current_user.role == "etv":
        from app.arqueos.service import _verify_vault_assignment
        await _verify_vault_assignment(db, current_user.id, vault_id)

    inventory = await _get_inv(db, vault_id, target)
    unmigrated = any(v is None for v in inventory.values())
    return {
        "vault_id": vault_id,
        "date": str(target),
        "unmigrated": unmigrated,
        "inventory": {
            k: str(v if v is not None else 0) for k, v in inventory.items()
        },
    }


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
    denoms = (
        body.initial_denominations.model_dump() if body.initial_denominations else None
    )
    return await vault_service.set_initial_balance(
        db,
        vault_id,
        body.initial_balance,
        denoms,
        admin.id,
        ip,
        ua,
    )
