# -*- coding: utf-8 -*-
"""Importación masiva de bóvedas desde CSV."""

import csv
import io
import logging
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import Company, Empresa, User, UserRole, EtvSubrole
from app.vaults.models import Vault
from app.vaults import service as vault_service

logger = logging.getLogger(__name__)


DENOMINATION_COLUMNS = [
    "bill_1000", "bill_500", "bill_200", "bill_100", "bill_50", "bill_20",
    "coin_100", "coin_50", "coin_20", "coin_10", "coin_5", "coin_2",
    "coin_1", "coin_050", "coin_020", "coin_010",
]

REQUIRED_COLUMNS = [
    "vault_code", "vault_name", "company_name", "empresa_name",
    "manager_email", "treasurer_email",
    *DENOMINATION_COLUMNS,
]


def parse_csv(content: bytes) -> tuple[list[dict[str, str]], list[str]]:
    """Decodifica el CSV. Devuelve (filas, errores_de_formato)."""
    errors: list[str] = []
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            return [], ["No se pudo decodificar el archivo. Asegúrate de que sea UTF-8."]

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return [], ["El archivo está vacío o no tiene encabezados."]

    headers = [h.strip() for h in reader.fieldnames]
    missing = [c for c in REQUIRED_COLUMNS if c not in headers]
    if missing:
        errors.append(
            f"Faltan columnas requeridas: {', '.join(missing)}."
        )

    rows = []
    for row in reader:
        rows.append({k.strip(): (v or "").strip() for k, v in row.items() if k})
    return rows, errors


def _parse_decimal(s: str, field: str, errors: list[str]) -> Decimal:
    if not s:
        return Decimal("0")
    try:
        d = Decimal(s)
        if d < 0:
            errors.append(f"{field}: el valor no puede ser negativo.")
            return Decimal("0")
        return d
    except (InvalidOperation, ValueError):
        errors.append(f"{field}: '{s}' no es un número válido.")
        return Decimal("0")


async def validate_and_preview(
    db: AsyncSession,
    rows: list[dict[str, str]],
) -> dict[str, Any]:
    """Valida cada fila y retorna preview con errores antes de aplicar."""
    if not rows:
        return {"items": [], "valid": 0, "invalid": 0}

    companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}
    empresas = {(e.name, e.etv_id): e for e in (await db.execute(select(Empresa))).scalars().all()}
    existing_codes = {
        c for (c,) in (await db.execute(select(Vault.vault_code))).all()
    }
    users_by_email = {
        u.email.lower(): u
        for u in (await db.execute(select(User))).scalars().all()
    }

    items = []
    valid_count = 0
    seen_codes_in_batch: set[str] = set()

    for ix, row in enumerate(rows, start=2):
        errors: list[str] = []

        vault_code = (row.get("vault_code") or "").strip().upper()
        vault_name = row.get("vault_name") or ""
        company_name = row.get("company_name") or ""
        empresa_name = row.get("empresa_name") or ""
        manager_email = (row.get("manager_email") or "").strip().lower() or None
        treasurer_email = (row.get("treasurer_email") or "").strip().lower() or None

        # vault_code
        if not vault_code:
            errors.append("vault_code requerido.")
        elif vault_code in existing_codes:
            errors.append(f"La bóveda '{vault_code}' ya existe.")
        elif vault_code in seen_codes_in_batch:
            errors.append(f"vault_code '{vault_code}' duplicado en el archivo.")
        else:
            seen_codes_in_batch.add(vault_code)

        # vault_name
        if len(vault_name) < 2:
            errors.append("vault_name requerido.")

        # ETV
        company = companies.get(company_name)
        if not company:
            errors.append(f"ETV (company_name) '{company_name}' no existe.")

        # Empresa (opcional)
        empresa = None
        if empresa_name:
            if company:
                empresa = empresas.get((empresa_name, company.id))
                if not empresa:
                    errors.append(
                        f"Sub-empresa '{empresa_name}' no existe dentro de '{company_name}'."
                    )
            else:
                errors.append("No se puede validar empresa sin una ETV válida.")

        # manager / treasurer
        manager_user = None
        treasurer_user = None
        if manager_email:
            u = users_by_email.get(manager_email)
            if not u:
                errors.append(f"manager_email '{manager_email}' no es un usuario registrado.")
            elif u.role != UserRole.etv:
                errors.append(f"manager_email '{manager_email}' no es un usuario ETV.")
            elif u.etv_subrole != EtvSubrole.gerente:
                errors.append(
                    f"manager_email '{manager_email}' no tiene sub-rol 'gerente'."
                )
            else:
                manager_user = u
        if treasurer_email:
            u = users_by_email.get(treasurer_email)
            if not u:
                errors.append(f"treasurer_email '{treasurer_email}' no es un usuario registrado.")
            elif u.role != UserRole.etv:
                errors.append(f"treasurer_email '{treasurer_email}' no es un usuario ETV.")
            elif u.etv_subrole != EtvSubrole.tesorero:
                errors.append(
                    f"treasurer_email '{treasurer_email}' no tiene sub-rol 'tesorero'."
                )
            else:
                treasurer_user = u

        # Denominaciones
        denominations: dict[str, Decimal] = {}
        for col in DENOMINATION_COLUMNS:
            denominations[f"initial_{col}"] = _parse_decimal(
                row.get(col, "") or "", col, errors,
            )

        if not errors:
            valid_count += 1

        items.append({
            "row": ix,
            "vault_code": vault_code,
            "vault_name": vault_name,
            "company_name": company_name,
            "empresa_name": empresa_name or None,
            "manager_email": manager_email,
            "treasurer_email": treasurer_email,
            "denominations": {k: str(v) for k, v in denominations.items()},
            "initial_balance": str(sum(denominations.values(), start=Decimal("0"))),
            "errors": errors,
            "status": "ok" if not errors else "error",
            # Internos para apply
            "_company_id": company.id if company else None,
            "_empresa_id": empresa.id if empresa else None,
            "_manager_id": manager_user.id if manager_user else None,
            "_treasurer_id": treasurer_user.id if treasurer_user else None,
        })

    return {
        "items": items,
        "valid": valid_count,
        "invalid": len(items) - valid_count,
    }


async def apply_import(
    db: AsyncSession,
    preview: dict[str, Any],
    admin_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """Aplica el import. No procesa nada si hay filas con error."""
    if preview["invalid"] > 0:
        return {
            "created": 0,
            "failed": preview["invalid"],
            "results": preview["items"],
            "applied": False,
            "message": "Hay errores en el archivo. Corrige y vuelve a intentar.",
        }

    created = 0
    results = []

    for item in preview["items"]:
        try:
            denoms = {
                k: Decimal(v) for k, v in item["denominations"].items()
            }
            vault = await vault_service.create_vault(
                db,
                vault_code=item["vault_code"],
                vault_name=item["vault_name"],
                company_id=item["_company_id"],
                empresa_id=item["_empresa_id"],
                manager_id=item["_manager_id"],
                treasurer_id=item["_treasurer_id"],
                initial_denominations=denoms,
                admin_user_id=admin_user_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            created += 1
            # Limpiar internos antes de devolver
            clean = {k: v for k, v in item.items() if not k.startswith("_")}
            results.append({**clean, "status": "created", "vault_id": vault.id})
        except Exception as exc:
            logger.error("Bulk import vault fila %d: %s", item["row"], exc)
            clean = {k: v for k, v in item.items() if not k.startswith("_")}
            results.append({**clean, "status": "error", "errors": [str(exc)]})

    return {
        "created": created,
        "failed": len(preview["items"]) - created,
        "results": results,
        "applied": True,
    }


def csv_template() -> str:
    """Plantilla CSV vacía con headers + 1 fila ejemplo."""
    headers = ",".join(REQUIRED_COLUMNS)
    sample = (
        "9001,Plaza Norte,ETV1,Sucursal Centro,g.norte@etv1.mx,t.norte@etv1.mx,"
        "50000,25000,10000,5000,2500,1000,2000,1500,500,300,150,100,50,20,10,5\n"
    )
    return f"{headers}\n{sample}"
