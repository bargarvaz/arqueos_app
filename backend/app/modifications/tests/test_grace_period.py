# -*- coding: utf-8 -*-
"""Tests unitarios para la lógica del periodo de gracia."""

import pytest
from datetime import date
from unittest.mock import AsyncMock, patch

from app.modifications.service import check_grace_period, get_grace_deadline


# ─── get_grace_deadline ───────────────────────────────────────────────────────

class TestGetGraceDeadline:
    """Verifica que el deadline apunta al último día hábil del mes M+1."""

    @pytest.mark.asyncio
    async def test_mes_enero(self):
        """Arqueo de enero → deadline en febrero."""
        target = date(2026, 2, 27)  # último día hábil de febrero 2026 (lunes)
        mock_db = AsyncMock()
        with patch(
            "app.modifications.service.get_last_business_day_of_month",
            new=AsyncMock(return_value=target),
        ) as mock_fn:
            result = await get_grace_deadline(mock_db, date(2026, 1, 15))
            # Debe llamarse para año 2026, mes 2
            mock_fn.assert_called_once_with(mock_db, 2026, 2)
            assert result == target

    @pytest.mark.asyncio
    async def test_mes_diciembre_cruza_anio(self):
        """Arqueo de diciembre → deadline en enero del año siguiente."""
        target = date(2027, 1, 29)
        mock_db = AsyncMock()
        with patch(
            "app.modifications.service.get_last_business_day_of_month",
            new=AsyncMock(return_value=target),
        ) as mock_fn:
            result = await get_grace_deadline(mock_db, date(2026, 12, 5))
            # Debe cruzar a año 2027, mes 1
            mock_fn.assert_called_once_with(mock_db, 2027, 1)
            assert result == target

    @pytest.mark.asyncio
    async def test_mes_noviembre(self):
        """Arqueo de noviembre → deadline en diciembre."""
        target = date(2026, 12, 31)
        mock_db = AsyncMock()
        with patch(
            "app.modifications.service.get_last_business_day_of_month",
            new=AsyncMock(return_value=target),
        ) as mock_fn:
            result = await get_grace_deadline(mock_db, date(2026, 11, 1))
            mock_fn.assert_called_once_with(mock_db, 2026, 12)
            assert result == target


# ─── check_grace_period ───────────────────────────────────────────────────────

class TestCheckGracePeriod:
    """Verifica estados: dentro, exactamente en el deadline, y vencido."""

    @pytest.mark.asyncio
    async def test_dentro_del_periodo(self):
        """Hoy está antes del deadline → is_within=True, days_remaining > 0."""
        mock_db = AsyncMock()
        # Simular que hoy es 2026-04-22 y el deadline es 2026-04-30
        future_deadline = date(2026, 4, 30)
        with patch(
            "app.modifications.service.get_grace_deadline",
            new=AsyncMock(return_value=future_deadline),
        ), patch(
            "app.modifications.service.date"
        ) as mock_date:
            mock_date.today.return_value = date(2026, 4, 22)
            mock_date.side_effect = lambda *args, **kwargs: date(*args, **kwargs)

            is_within, deadline, days = await check_grace_period(mock_db, date(2026, 3, 15))

            assert is_within is True
            assert deadline == future_deadline
            assert days == 8  # 30 - 22 = 8

    @pytest.mark.asyncio
    async def test_exactamente_en_el_deadline(self):
        """Hoy ES el deadline → is_within=True, days_remaining=0."""
        mock_db = AsyncMock()
        deadline = date(2026, 4, 30)
        with patch(
            "app.modifications.service.get_grace_deadline",
            new=AsyncMock(return_value=deadline),
        ), patch(
            "app.modifications.service.date"
        ) as mock_date:
            mock_date.today.return_value = date(2026, 4, 30)
            mock_date.side_effect = lambda *args, **kwargs: date(*args, **kwargs)

            is_within, result_deadline, days = await check_grace_period(mock_db, date(2026, 3, 15))

            assert is_within is True
            assert result_deadline == deadline
            assert days == 0

    @pytest.mark.asyncio
    async def test_periodo_vencido(self):
        """Hoy supera el deadline → is_within=False, days_remaining=None."""
        mock_db = AsyncMock()
        deadline = date(2026, 3, 31)
        with patch(
            "app.modifications.service.get_grace_deadline",
            new=AsyncMock(return_value=deadline),
        ), patch(
            "app.modifications.service.date"
        ) as mock_date:
            mock_date.today.return_value = date(2026, 4, 15)
            mock_date.side_effect = lambda *args, **kwargs: date(*args, **kwargs)

            is_within, result_deadline, days = await check_grace_period(mock_db, date(2026, 2, 10))

            assert is_within is False
            assert result_deadline == deadline
            assert days is None

    @pytest.mark.asyncio
    async def test_arqueo_mismo_mes(self):
        """Arqueo del mes actual → siempre tiene periodo de gracia vigente."""
        mock_db = AsyncMock()
        # Arqueo de abril, hoy 22 abril, deadline fin de mayo
        deadline = date(2026, 5, 29)
        with patch(
            "app.modifications.service.get_grace_deadline",
            new=AsyncMock(return_value=deadline),
        ), patch(
            "app.modifications.service.date"
        ) as mock_date:
            mock_date.today.return_value = date(2026, 4, 22)
            mock_date.side_effect = lambda *args, **kwargs: date(*args, **kwargs)

            is_within, result_deadline, days = await check_grace_period(mock_db, date(2026, 4, 20))

            assert is_within is True
            assert days == 37  # 29 mayo - 22 abril = 37
