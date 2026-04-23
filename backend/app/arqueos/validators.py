# -*- coding: utf-8 -*-
"""
Validadores de reglas de negocio para arqueos.

Todas las validaciones se aplican en backend antes de persistir.
Los mismos controles deben replicarse en el frontend para feedback inmediato.
"""

from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from app.common.exceptions import ValidationAppError


# Mapa: nombre_campo → valor_facial (en pesos)
DENOMINATION_MULTIPLIERS: dict[str, Decimal] = {
    "bill_1000": Decimal("1000"),
    "bill_500": Decimal("500"),
    "bill_200": Decimal("200"),
    "bill_100": Decimal("100"),
    "bill_50": Decimal("50"),
    "bill_20": Decimal("20"),
    "coin_100": Decimal("100"),
    "coin_50": Decimal("50"),
    "coin_20": Decimal("20"),
    "coin_10": Decimal("10"),
    "coin_5": Decimal("5"),
    "coin_2": Decimal("2"),
    "coin_1": Decimal("1"),
    "coin_050": Decimal("0.50"),
    "coin_020": Decimal("0.20"),
    "coin_010": Decimal("0.10"),
}


def _to_decimal(value: Any) -> Decimal:
    """Convierte cualquier tipo a Decimal con 2 decimales."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def validate_denominations_multiple(record_data: dict[str, Any]) -> list[str]:
    """
    Regla 2: cada campo de denominación debe ser múltiplo exacto de su valor facial.
    Retorna lista de errores (vacía = OK).
    """
    errors = []
    for field, multiplier in DENOMINATION_MULTIPLIERS.items():
        value = _to_decimal(record_data.get(field, 0))
        if value == 0:
            continue
        # Verificar que es múltiplo: value % multiplier == 0
        remainder = value % multiplier
        if remainder != 0:
            errors.append(
                f"El campo '{field}' ({value}) debe ser múltiplo de {multiplier}."
            )
    return errors


def validate_denomination_sum_matches(record_data: dict[str, Any]) -> list[str]:
    """
    Regla 1 (Doble validación de cuadre):
    La suma de todas las denominaciones debe ser exactamente igual
    al valor de entries (si es entrada) o withdrawals (si es salida).
    """
    errors = []
    entries = _to_decimal(record_data.get("entries", 0))
    withdrawals = _to_decimal(record_data.get("withdrawals", 0))

    denom_sum = sum(
        _to_decimal(record_data.get(f, 0)) for f in DENOMINATION_MULTIPLIERS
    )

    active_amount = entries if entries > 0 else withdrawals

    if active_amount == 0:
        return errors  # Si no hay monto, no hay que validar

    if denom_sum != active_amount:
        errors.append(
            f"La suma de denominaciones ({denom_sum}) no coincide con el monto declarado ({active_amount}). "
            "Verifica el desglose de billetes y monedas."
        )
    return errors


def validate_entries_withdrawals_exclusive(record_data: dict[str, Any]) -> list[str]:
    """
    Regla 3: entries y withdrawals son mutuamente excluyentes.
    """
    entries = _to_decimal(record_data.get("entries", 0))
    withdrawals = _to_decimal(record_data.get("withdrawals", 0))

    if entries > 0 and withdrawals > 0:
        return ["Un registro no puede tener entradas Y salidas al mismo tiempo."]
    return []


def validate_required_fields(record_data: dict[str, Any]) -> list[str]:
    """
    Regla 5: campos obligatorios.
    """
    errors = []
    if not str(record_data.get("voucher", "")).strip():
        errors.append("El campo 'comprobante' es obligatorio.")
    if not str(record_data.get("reference", "")).strip():
        errors.append("El campo 'referencia' es obligatorio.")
    if not record_data.get("branch_id"):
        errors.append("La sucursal es obligatoria.")
    if not record_data.get("movement_type_id"):
        errors.append("El tipo de movimiento es obligatorio.")

    entries = _to_decimal(record_data.get("entries", 0))
    withdrawals = _to_decimal(record_data.get("withdrawals", 0))
    if entries == 0 and withdrawals == 0:
        errors.append("Debe ingresar un monto en entradas o salidas.")

    return errors


def is_row_empty(record_data: dict[str, Any]) -> bool:
    """
    Determina si una fila está completamente vacía (se debe ignorar al publicar).
    Una fila es vacía si TODOS sus campos son sus valores por defecto.
    """
    text_fields = ["voucher", "reference"]
    for field in text_fields:
        if str(record_data.get(field, "")).strip():
            return False

    if record_data.get("branch_id") or record_data.get("movement_type_id"):
        return False

    numeric_fields = ["entries", "withdrawals"] + list(DENOMINATION_MULTIPLIERS.keys())
    for field in numeric_fields:
        if _to_decimal(record_data.get(field, 0)) != 0:
            return False

    return True


def validate_record(record_data: dict[str, Any]) -> None:
    """
    Ejecuta todas las validaciones de un registro. Lanza ValidationAppError si hay errores.
    """
    if is_row_empty(record_data):
        raise ValidationAppError("La fila está vacía.")

    errors: list[str] = []
    errors.extend(validate_required_fields(record_data))
    errors.extend(validate_entries_withdrawals_exclusive(record_data))
    errors.extend(validate_denominations_multiple(record_data))
    errors.extend(validate_denomination_sum_matches(record_data))

    if errors:
        raise ValidationAppError(" | ".join(errors))
