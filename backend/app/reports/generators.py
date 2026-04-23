# -*- coding: utf-8 -*-
"""Generadores de archivos XLSX para reportes descargables."""

import io
from datetime import date
from typing import Any

import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter


# Verde militar para encabezados
HEADER_BG = "4A5D23"
HEADER_FG = "FFFFFF"


def _style_header_row(ws, row: int, num_cols: int) -> None:
    """Aplica estilo de encabezado a una fila."""
    for col in range(1, num_cols + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = Font(bold=True, color=HEADER_FG)
        cell.fill = PatternFill("solid", fgColor=HEADER_BG)
        cell.alignment = Alignment(horizontal="center")


def _auto_width(ws) -> None:
    """Ajusta el ancho de columnas automáticamente."""
    for col_cells in ws.columns:
        max_len = max(
            (len(str(cell.value or "")) for cell in col_cells),
            default=10,
        )
        ws.column_dimensions[get_column_letter(col_cells[0].column)].width = min(
            max_len + 4, 50
        )


def generate_daily_balances_xlsx(
    rows: list[dict[str, Any]],
    date_from: date | None,
    date_to: date | None,
) -> bytes:
    """
    Genera un XLSX de saldos diarios por bóveda.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Saldos Diarios"

    # Metadatos
    ws["A1"] = "Reporte: Saldos Diarios por Bóveda"
    ws["A1"].font = Font(bold=True, size=12)
    ws["A2"] = f"Periodo: {date_from or 'inicio'} al {date_to or 'hoy'}"
    ws["A2"].font = Font(italic=True, color="666666")
    ws.append([])  # Fila 3 vacía

    # Encabezados
    headers = [
        "Fecha", "Empresa", "Código Bóveda", "Bóveda",
        "Apertura", "Entradas", "Salidas", "Cierre", "Estado"
    ]
    ws.append(headers)
    _style_header_row(ws, 4, len(headers))

    # Datos
    for row in rows:
        ws.append([
            row.get("date", ""),
            row.get("company_name", ""),
            row.get("vault_code", ""),
            row.get("vault_name", ""),
            row.get("opening_balance", 0),
            row.get("total_entries", 0),
            row.get("total_withdrawals", 0),
            row.get("closing_balance", 0),
            row.get("status", ""),
        ])

    # Formato numérico para columnas monetarias (E:H)
    for row_cells in ws.iter_rows(min_row=5, min_col=5, max_col=8):
        for cell in row_cells:
            cell.number_format = '#,##0.00'

    _auto_width(ws)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def generate_records_xlsx(
    rows: list[dict[str, Any]],
    filters_applied: dict[str, Any],
) -> bytes:
    """Genera XLSX de registros de arqueo con filtros aplicados."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Registros de Arqueo"

    # Metadatos de filtros
    ws["A1"] = "Reporte: Registros de Arqueo"
    ws["A1"].font = Font(bold=True, size=12)
    filter_str = " | ".join(
        f"{k}: {v}" for k, v in filters_applied.items() if v is not None
    )
    ws["A2"] = f"Filtros: {filter_str or 'ninguno'}"
    ws["A2"].font = Font(italic=True, color="666666")
    ws.append([])

    headers = [
        "UID", "Fecha Arqueo", "Empresa", "Bóveda",
        "Comprobante", "Referencia", "Sucursal",
        "Tipo Movimiento", "Entradas", "Salidas",
        "Fecha Registro", "Estado"
    ]
    ws.append(headers)
    _style_header_row(ws, 4, len(headers))

    for row in rows:
        ws.append([
            row.get("record_uid", ""),
            row.get("arqueo_date", ""),
            row.get("company_name", ""),
            row.get("vault_code", ""),
            row.get("voucher", ""),
            row.get("reference", ""),
            row.get("branch_name", ""),
            row.get("movement_type_name", ""),
            row.get("entries", 0),
            row.get("withdrawals", 0),
            row.get("record_date", ""),
            "Activo" if row.get("is_active") else "Inactivo",
        ])

    for row_cells in ws.iter_rows(min_row=5, min_col=9, max_col=10):
        for cell in row_cells:
            cell.number_format = '#,##0.00'

    _auto_width(ws)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()
