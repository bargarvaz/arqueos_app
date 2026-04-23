# -*- coding: utf-8 -*-
"""Paginación genérica para todos los endpoints de listado."""

from typing import TypeVar, Generic, Sequence
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

# Límite máximo de registros para paginación "total"
MAX_TOTAL_RECORDS = 10_000


class PaginationParams(BaseModel):
    """Parámetros de paginación recibidos via query string."""

    page: int = Field(default=1, ge=1, description="Número de página (inicia en 1)")
    page_size: int = Field(
        default=25,
        description="Registros por página (25, 50, 100, o 0 para todos hasta 10,000)",
    )

    @field_validator("page_size")
    @classmethod
    def validate_page_size(cls, v: int) -> int:
        allowed = {0, 25, 50, 100}
        if v not in allowed:
            raise ValueError(f"page_size debe ser uno de: {sorted(allowed)}")
        return v

    @property
    def offset(self) -> int:
        if self.page_size == 0:
            return 0
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int | None:
        """None significa sin límite (backend lo corta en MAX_TOTAL_RECORDS)."""
        return self.page_size if self.page_size > 0 else MAX_TOTAL_RECORDS


class PagedResponse(BaseModel, Generic[T]):
    """Respuesta paginada estándar."""

    items: Sequence[T]
    total: int
    page: int
    page_size: int
    pages: int

    @classmethod
    def build(cls, items: Sequence[T], total: int, params: PaginationParams):
        page_size = params.page_size or MAX_TOTAL_RECORDS
        pages = (total + page_size - 1) // page_size if page_size > 0 else 1
        return cls(
            items=items,
            total=total,
            page=params.page,
            page_size=params.page_size,
            pages=pages,
        )
