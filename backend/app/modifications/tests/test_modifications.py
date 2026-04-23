# -*- coding: utf-8 -*-
"""Tests unitarios para la lógica de modificaciones."""

import pytest
from decimal import Decimal
from datetime import date
from unittest.mock import MagicMock

from app.modifications.service import _negate_record
from app.arqueos.models import ArqueoRecord


def _make_record(entries: str = "0", withdrawals: str = "0") -> ArqueoRecord:
    rec = MagicMock(spec=ArqueoRecord)
    rec.entries = Decimal(entries)
    rec.withdrawals = Decimal(withdrawals)
    rec.record_uid = "ABC123"
    rec.voucher = "VCH-001"
    rec.reference = "REF-001"
    rec.branch_id = 1
    rec.movement_type_id = 1
    rec.record_date = date(2026, 1, 15)
    # Denominaciones en 0
    for field in [
        "bill_1000", "bill_500", "bill_200", "bill_100", "bill_50", "bill_20",
        "coin_100", "coin_50", "coin_20", "coin_10", "coin_5", "coin_2",
        "coin_1", "coin_050", "coin_020", "coin_010",
    ]:
        setattr(rec, field, Decimal("0"))
    return rec


class TestNegateRecord:
    def test_entry_becomes_withdrawal(self):
        rec = _make_record(entries="1000", withdrawals="0")
        negated = _negate_record(rec)
        assert negated["entries"] == "0"
        assert negated["withdrawals"] == "1000"

    def test_withdrawal_becomes_entry(self):
        rec = _make_record(entries="0", withdrawals="500")
        negated = _negate_record(rec)
        assert negated["entries"] == "500"
        assert negated["withdrawals"] == "0"

    def test_fields_preserved(self):
        rec = _make_record(entries="2000", withdrawals="0")
        negated = _negate_record(rec)
        assert negated["voucher"] == "VCH-001"
        assert negated["reference"] == "REF-001"
        assert negated["branch_id"] == 1
        assert negated["movement_type_id"] == 1

    def test_denominations_copied(self):
        rec = _make_record(entries="1000", withdrawals="0")
        rec.bill_1000 = Decimal("1000")
        negated = _negate_record(rec)
        assert negated["bill_1000"] == "1000"

    def test_zero_both_stays_zero(self):
        rec = _make_record(entries="0", withdrawals="0")
        negated = _negate_record(rec)
        assert negated["entries"] == "0"
        assert negated["withdrawals"] == "0"
