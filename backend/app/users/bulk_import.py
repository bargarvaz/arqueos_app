# -*- coding: utf-8 -*-
"""Importación masiva de usuarios desde CSV."""

import csv
import io
import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import (
    Company, Empresa, User, UserRole, UserType, EtvSubrole, UserVaultAssignment,
)
from app.vaults.models import Vault
from app.users import service as user_service

logger = logging.getLogger(__name__)


REQUIRED_COLUMNS = [
    "email", "full_name", "role", "etv_subrole",
    "puesto", "company_name", "empresa_name", "vault_codes",
]


def parse_csv(content: bytes) -> tuple[list[dict[str, str]], list[str]]:
    """Decodifica el CSV y devuelve filas como dicts. Lista de errores si formato malo."""
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
            f"Faltan columnas requeridas: {', '.join(missing)}. "
            f"Esperadas: {', '.join(REQUIRED_COLUMNS)}."
        )

    rows = []
    for row in reader:
        rows.append({k.strip(): (v or "").strip() for k, v in row.items() if k})
    return rows, errors


async def validate_and_preview(
    db: AsyncSession,
    rows: list[dict[str, str]],
) -> dict[str, Any]:
    """
    Valida cada fila y arma un preview con los errores antes de aplicar.
    Retorna {"items": [...por fila con status y mensajes...], "valid": int, "invalid": int}.
    """
    if not rows:
        return {"items": [], "valid": 0, "invalid": 0}

    # Pre-cargar lookups
    companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}
    empresas = {(e.name, e.etv_id): e for e in (await db.execute(select(Empresa))).scalars().all()}
    existing_emails = {
        e for (e,) in (await db.execute(select(User.email))).all()
    }
    vaults_by_code = {
        v.vault_code: v for v in (await db.execute(select(Vault))).scalars().all()
    }

    valid_roles = {r.value for r in UserRole}
    valid_subroles = {s.value for s in EtvSubrole}

    items = []
    valid_count = 0
    seen_emails_in_batch: set[str] = set()

    for ix, row in enumerate(rows, start=2):  # 2 = primera fila de datos (1 = header)
        errors: list[str] = []
        email = (row.get("email") or "").lower()
        full_name = row.get("full_name") or ""
        role = (row.get("role") or "").lower()
        subrole = (row.get("etv_subrole") or "").lower() or None
        puesto = row.get("puesto") or None
        company_name = row.get("company_name") or ""
        empresa_name = row.get("empresa_name") or ""
        vault_codes_raw = row.get("vault_codes") or ""

        # Validar email
        if not email or "@" not in email:
            errors.append("Email inválido o vacío.")
        elif email in existing_emails:
            errors.append(f"El email '{email}' ya está registrado.")
        elif email in seen_emails_in_batch:
            errors.append(f"El email '{email}' aparece duplicado en el archivo.")
        else:
            seen_emails_in_batch.add(email)

        # Validar nombre
        if len(full_name) < 2:
            errors.append("Nombre completo requerido (mín. 2 caracteres).")

        # Validar rol
        if role not in valid_roles:
            errors.append(
                f"Rol '{role}' inválido. Use: {', '.join(sorted(valid_roles))}."
            )

        # Subrol ETV
        company = None
        empresa = None
        vault_codes: list[str] = []
        if role == "etv":
            if subrole not in valid_subroles:
                errors.append(
                    "Sub-rol requerido para ETV: 'gerente' o 'tesorero'."
                )
            if not company_name:
                errors.append("ETV requiere 'company_name' (nombre exacto de la ETV).")
            else:
                company = companies.get(company_name)
                if not company:
                    errors.append(f"ETV '{company_name}' no existe en el catálogo.")
            if empresa_name and company:
                empresa = empresas.get((empresa_name, company.id))
                if not empresa:
                    errors.append(
                        f"Sub-empresa '{empresa_name}' no existe dentro de '{company_name}'."
                    )
            # Bóvedas
            if vault_codes_raw:
                codes = [c.strip().upper() for c in vault_codes_raw.split(";") if c.strip()]
                vault_codes = codes
                for c in codes:
                    if c not in vaults_by_code:
                        errors.append(f"Bóveda '{c}' no existe.")
        else:
            if subrole:
                errors.append("Solo los usuarios ETV pueden tener sub-rol.")
            if company_name or empresa_name or vault_codes_raw:
                errors.append("ETV-only: company/empresa/bóvedas solo aplican a ETVs.")

        if not errors:
            valid_count += 1

        items.append({
            "row": ix,
            "email": email,
            "full_name": full_name,
            "role": role,
            "etv_subrole": subrole,
            "puesto": puesto,
            "company_name": company_name or None,
            "empresa_name": empresa_name or None,
            "vault_codes": vault_codes,
            "errors": errors,
            "status": "ok" if not errors else "error",
        })

    return {
        "items": items,
        "valid": valid_count,
        "invalid": len(items) - valid_count,
    }


async def apply_import(
    db: AsyncSession,
    preview: dict[str, Any],
    created_by_user_id: int,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> dict[str, Any]:
    """
    Aplica el import. Solo crea las filas válidas. Si una falla a mitad de
    proceso, las anteriores quedan creadas (cada usuario es un commit propio).
    Retorna { created: int, failed: int, results: [...por fila...] }.
    """
    if preview["invalid"] > 0:
        # Política: si hay errores, no se aplica nada
        return {
            "created": 0,
            "failed": preview["invalid"],
            "results": preview["items"],
            "applied": False,
            "message": "Hay errores en el archivo. Corrige y vuelve a intentar.",
        }

    # Lookups
    companies = {c.name: c for c in (await db.execute(select(Company))).scalars().all()}
    empresas = {(e.name, e.etv_id): e for e in (await db.execute(select(Empresa))).scalars().all()}
    vaults_by_code = {
        v.vault_code: v for v in (await db.execute(select(Vault))).scalars().all()
    }

    created = 0
    results = []

    for item in preview["items"]:
        try:
            company = companies.get(item["company_name"]) if item["company_name"] else None
            empresa = (
                empresas.get((item["empresa_name"], company.id))
                if (item["empresa_name"] and company)
                else None
            )
            vault_ids = [
                vaults_by_code[c].id for c in item["vault_codes"]
                if c in vaults_by_code
            ]

            user, temp_password = await user_service.create_user(
                db,
                email=item["email"],
                full_name=item["full_name"],
                role=UserRole(item["role"]),
                company_id=company.id if company else None,
                empresa_id=empresa.id if empresa else None,
                puesto=item["puesto"],
                etv_subrole=EtvSubrole(item["etv_subrole"]) if item["etv_subrole"] else None,
                vault_ids=vault_ids,
                created_by_user_id=created_by_user_id,
                ip_address=ip_address,
                user_agent=user_agent,
            )
            created += 1
            results.append({**item, "status": "created", "temp_password": temp_password})
        except Exception as exc:
            logger.error("Bulk import user fila %d: %s", item["row"], exc)
            results.append({**item, "status": "error", "errors": [str(exc)]})

    return {
        "created": created,
        "failed": len(preview["items"]) - created,
        "results": results,
        "applied": True,
    }


def csv_template() -> str:
    """Plantilla CSV vacía para descargar."""
    sample = (
        "email,full_name,role,etv_subrole,puesto,company_name,empresa_name,vault_codes\n"
        "admin@arqueos.app,Administrador General,admin,,Admin,,,\n"
        "ops@empresa.com,Marco Operaciones,operations,,Coordinador,,,\n"
        "g.norte@etv1.mx,Luis Gomez,etv,gerente,Gerente Norte,ETV1,Sucursal Centro,9001;9002\n"
        "t.norte@etv1.mx,Sara Lopez,etv,tesorero,Tesorero Norte,ETV1,Sucursal Centro,9001\n"
    )
    return sample
