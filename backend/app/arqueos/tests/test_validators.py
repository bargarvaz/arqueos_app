# -*- coding: utf-8 -*-
"""Tests unitarios para los validadores de arqueos."""

import pytest
from decimal import Decimal

from app.arqueos.validators import (
    validate_denominations_multiple,
    validate_denomination_sum_matches,
    validate_entries_withdrawals_exclusive,
    validate_required_fields,
    is_row_empty,
    validate_record,
    DENOMINATION_MULTIPLIERS,
)
from app.common.exceptions import ValidationAppError


# ─── Fixtures ─────────────────────────────────────────────────────────────────

def _base_record(**overrides) -> dict:
    """Registro válido de base."""
    record = {
        "voucher": "VCH-001",
        "reference": "REF-001",
        "branch_id": 1,
        "movement_type_id": 1,
        "entries": Decimal("1000.00"),
        "withdrawals": Decimal("0"),
        "bill_1000": Decimal("1000.00"),
        "bill_500": Decimal("0"),
        "bill_200": Decimal("0"),
        "bill_100": Decimal("0"),
        "bill_50": Decimal("0"),
        "bill_20": Decimal("0"),
        "coin_100": Decimal("0"),
        "coin_50": Decimal("0"),
        "coin_20": Decimal("0"),
        "coin_10": Decimal("0"),
        "coin_5": Decimal("0"),
        "coin_2": Decimal("0"),
        "coin_1": Decimal("0"),
        "coin_050": Decimal("0"),
        "coin_020": Decimal("0"),
        "coin_010": Decimal("0"),
    }
    record.update(overrides)
    return record


# ─── is_row_empty ─────────────────────────────────────────────────────────────

class TestIsRowEmpty:
    def test_all_defaults_is_empty(self):
        record = {
            "voucher": "", "reference": "", "branch_id": None,
            "movement_type_id": None, "entries": 0, "withdrawals": 0,
        }
        for k in DENOMINATION_MULTIPLIERS:
            record[k] = 0
        assert is_row_empty(record) is True

    def test_with_voucher_not_empty(self):
        record = {"voucher": "X", "reference": "", "branch_id": None, "movement_type_id": None, "entries": 0, "withdrawals": 0}
        for k in DENOMINATION_MULTIPLIERS:
            record[k] = 0
        assert is_row_empty(record) is False

    def test_with_entries_not_empty(self):
        record = {"voucher": "", "reference": "", "branch_id": None, "movement_type_id": None, "entries": "100", "withdrawals": 0}
        for k in DENOMINATION_MULTIPLIERS:
            record[k] = 0
        assert is_row_empty(record) is False

    def test_with_branch_not_empty(self):
        record = {"voucher": "", "reference": "", "branch_id": 1, "movement_type_id": None, "entries": 0, "withdrawals": 0}
        for k in DENOMINATION_MULTIPLIERS:
            record[k] = 0
        assert is_row_empty(record) is False


# ─── validate_required_fields ─────────────────────────────────────────────────

class TestRequiredFields:
    def test_valid_record_no_errors(self):
        errors = validate_required_fields(_base_record())
        assert errors == []

    def test_missing_voucher(self):
        errors = validate_required_fields(_base_record(voucher=""))
        assert any("comprobante" in e for e in errors)

    def test_missing_reference(self):
        errors = validate_required_fields(_base_record(reference="  "))
        assert any("referencia" in e for e in errors)

    def test_missing_branch(self):
        errors = validate_required_fields(_base_record(branch_id=0))
        assert any("sucursal" in e for e in errors)

    def test_missing_movement_type(self):
        errors = validate_required_fields(_base_record(movement_type_id=None))
        assert any("movimiento" in e for e in errors)

    def test_zero_amounts(self):
        errors = validate_required_fields(_base_record(entries=0, withdrawals=0))
        assert any("monto" in e for e in errors)


# ─── validate_entries_withdrawals_exclusive ───────────────────────────────────

class TestEntriesWithdrawalsExclusive:
    def test_only_entries_ok(self):
        assert validate_entries_withdrawals_exclusive(_base_record()) == []

    def test_only_withdrawals_ok(self):
        errors = validate_entries_withdrawals_exclusive(
            _base_record(entries=0, withdrawals=Decimal("500"))
        )
        assert errors == []

    def test_both_fail(self):
        errors = validate_entries_withdrawals_exclusive(
            _base_record(entries=Decimal("100"), withdrawals=Decimal("100"))
        )
        assert len(errors) == 1
        assert "al mismo tiempo" in errors[0]


# ─── validate_denominations_multiple ─────────────────────────────────────────

class TestDenominationsMultiple:
    def test_exact_multiple_ok(self):
        # bill_1000: 1000 → múltiplo de 1000
        errors = validate_denominations_multiple(_base_record())
        assert errors == []

    def test_bill_1000_not_multiple(self):
        errors = validate_denominations_multiple(_base_record(bill_1000=Decimal("1500")))
        assert any("bill_1000" in e for e in errors)

    def test_coin_050_multiple(self):
        # 0.50 * 3 = 1.50 → es múltiplo de 0.50
        errors = validate_denominations_multiple(_base_record(coin_050=Decimal("1.50")))
        assert errors == []

    def test_coin_050_not_multiple(self):
        # 0.30 no es múltiplo de 0.50
        errors = validate_denominations_multiple(_base_record(coin_050=Decimal("0.30")))
        assert any("coin_050" in e for e in errors)

    def test_zero_denomination_skipped(self):
        errors = validate_denominations_multiple(_base_record(bill_500=Decimal("0")))
        assert errors == []


# ─── validate_denomination_sum_matches ───────────────────────────────────────

class TestDenominationSumMatches:
    def test_exact_match_ok(self):
        # entries=1000, bill_1000=1000 → OK
        errors = validate_denomination_sum_matches(_base_record())
        assert errors == []

    def test_sum_mismatch(self):
        errors = validate_denomination_sum_matches(
            _base_record(entries=Decimal("1000"), bill_1000=Decimal("500"))
        )
        assert len(errors) == 1
        assert "no coincide" in errors[0]

    def test_withdrawals_matches(self):
        record = _base_record(
            entries=Decimal("0"),
            withdrawals=Decimal("500"),
            bill_1000=Decimal("0"),
            bill_500=Decimal("500"),
        )
        errors = validate_denomination_sum_matches(record)
        assert errors == []

    def test_zero_amount_no_check(self):
        # Si entries=0 y withdrawals=0, no se valida la suma
        record = _base_record(entries=0, withdrawals=0, bill_1000=0)
        errors = validate_denomination_sum_matches(record)
        assert errors == []


# ─── validate_record (integración) ───────────────────────────────────────────

class TestValidateRecord:
    def test_valid_record_no_exception(self):
        validate_record(_base_record())  # No debe lanzar

    def test_empty_record_raises(self):
        empty = {"voucher": "", "reference": "", "branch_id": None, "movement_type_id": None, "entries": 0, "withdrawals": 0}
        for k in DENOMINATION_MULTIPLIERS:
            empty[k] = 0
        with pytest.raises(ValidationAppError):
            validate_record(empty)

    def test_invalid_record_raises(self):
        with pytest.raises(ValidationAppError):
            validate_record(_base_record(voucher=""))

    def test_denomination_mismatch_raises(self):
        with pytest.raises(ValidationAppError):
            validate_record(_base_record(bill_1000=Decimal("500")))  # sum no cuadra

    def test_both_entries_withdrawals_raises(self):
        with pytest.raises(ValidationAppError):
            validate_record(_base_record(entries=Decimal("500"), withdrawals=Decimal("500")))

    def test_not_multiple_raises(self):
        # bill_1000 = 1500 → no es múltiplo de 1000
        with pytest.raises(ValidationAppError):
            validate_record(_base_record(bill_1000=Decimal("1500"), entries=Decimal("1500")))
