# -*- coding: utf-8 -*-
"""Tests de integración para el servicio de arqueos (cálculos y lógica core)."""

import pytest
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

from app.arqueos.service import _calculate_closing_balance
from app.arqueos.models import ArqueoRecord


# ─── _calculate_closing_balance ───────────────────────────────────────────────

class TestCalculateClosingBalance:
    def _make_record(self, entries: str, withdrawals: str, is_active: bool = True) -> ArqueoRecord:
        rec = MagicMock(spec=ArqueoRecord)
        rec.entries = Decimal(entries)
        rec.withdrawals = Decimal(withdrawals)
        rec.is_active = is_active
        return rec

    def test_no_records(self):
        result = _calculate_closing_balance(Decimal("5000"), [])
        assert result == Decimal("5000")

    def test_only_entries(self):
        records = [
            self._make_record("1000", "0"),
            self._make_record("500", "0"),
        ]
        result = _calculate_closing_balance(Decimal("10000"), records)
        assert result == Decimal("11500")

    def test_only_withdrawals(self):
        records = [self._make_record("0", "2000")]
        result = _calculate_closing_balance(Decimal("10000"), records)
        assert result == Decimal("8000")

    def test_mixed(self):
        records = [
            self._make_record("3000", "0"),
            self._make_record("0", "1500"),
        ]
        result = _calculate_closing_balance(Decimal("10000"), records)
        assert result == Decimal("11500")

    def test_inactive_records_ignored(self):
        records = [
            self._make_record("5000", "0", is_active=True),
            self._make_record("9999", "0", is_active=False),  # debe ignorarse
        ]
        result = _calculate_closing_balance(Decimal("0"), records)
        assert result == Decimal("5000")

    def test_negative_balance(self):
        records = [self._make_record("0", "20000")]
        result = _calculate_closing_balance(Decimal("5000"), records)
        assert result == Decimal("-15000")

    def test_decimal_precision(self):
        records = [
            self._make_record("0.50", "0"),
            self._make_record("0.20", "0"),
        ]
        result = _calculate_closing_balance(Decimal("0.10"), records)
        assert result == Decimal("0.80")
