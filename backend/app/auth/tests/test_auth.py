# -*- coding: utf-8 -*-
"""Tests unitarios del módulo de autenticación."""

import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from app.auth.utils import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
    generate_otp,
    generate_temp_password,
    validate_password_strength,
)
from app.auth.otp_store import OtpSession
from app.config import settings


# ─── Tests de hashing ─────────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        hashed = hash_password("MySecureP@ss1")
        assert hashed != "MySecureP@ss1"

    def test_verify_correct_password(self):
        pwd = "MySecureP@ss1"
        assert verify_password(pwd, hash_password(pwd)) is True

    def test_reject_wrong_password(self):
        assert verify_password("wrong", hash_password("correct")) is False


# ─── Tests de JWT ─────────────────────────────────────────────────────────────

class TestJWT:
    def test_access_token_valid(self):
        token = create_access_token(user_id=42)
        payload = decode_access_token(token)
        assert payload is not None
        assert payload["sub"] == 42
        assert payload["type"] == "access"

    def test_refresh_token_valid(self):
        token = create_refresh_token(user_id=7)
        payload = decode_refresh_token(token)
        assert payload is not None
        assert payload["sub"] == 7
        assert payload["type"] == "refresh"

    def test_access_token_rejected_as_refresh(self):
        token = create_access_token(user_id=1)
        assert decode_refresh_token(token) is None

    def test_refresh_token_rejected_as_access(self):
        token = create_refresh_token(user_id=1)
        assert decode_access_token(token) is None

    def test_invalid_token_returns_none(self):
        assert decode_access_token("garbage.token.here") is None

    def test_tampered_token_returns_none(self):
        token = create_access_token(user_id=1)
        tampered = token[:-5] + "XXXXX"
        assert decode_access_token(tampered) is None


# ─── Tests de OTP ─────────────────────────────────────────────────────────────

class TestOTP:
    def test_otp_is_6_digits(self):
        otp = generate_otp()
        assert len(otp) == 6
        assert otp.isdigit()

    def test_otp_is_random(self):
        otps = {generate_otp() for _ in range(100)}
        # Con 10^6 posibilidades, 100 OTPs deberían ser mayoritariamente únicos
        assert len(otps) > 50

    def test_otp_session_expires(self):
        session = OtpSession(
            email="test@example.com",
            otp_code="123456",
            user_id=1,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=6),
        )
        assert session.is_expired() is True

    def test_otp_session_not_expired(self):
        session = OtpSession(
            email="test@example.com",
            otp_code="123456",
            user_id=1,
        )
        assert session.is_expired() is False

    def test_otp_resend_locked_after_max(self):
        session = OtpSession(
            email="test@example.com",
            otp_code="123456",
            user_id=1,
        )
        session.resend_count = settings.otp_max_resends_per_session
        can, msg = session.can_resend()
        assert can is False
        assert "intentos" in msg.lower()

    def test_otp_resend_cooldown(self):
        session = OtpSession(
            email="test@example.com",
            otp_code="123456",
            user_id=1,
        )
        session.last_resend_at = datetime.now(timezone.utc)  # Justo ahora
        can, msg = session.can_resend()
        assert can is False
        assert "espera" in msg.lower()


# ─── Tests de contraseña temporal ────────────────────────────────────────────

class TestTempPassword:
    def test_temp_password_min_length(self):
        pwd = generate_temp_password()
        assert len(pwd) >= 12

    def test_temp_password_complexity(self):
        pwd = generate_temp_password()
        errors = validate_password_strength(pwd)
        assert errors == [], f"Contraseña temporal no cumple requisitos: {errors}"

    def test_temp_password_is_random(self):
        passwords = {generate_temp_password() for _ in range(20)}
        assert len(passwords) > 15


# ─── Tests de validación de contraseñas ───────────────────────────────────────

class TestPasswordValidation:
    def test_too_short(self):
        errors = validate_password_strength("Short1!")
        assert any("12" in e for e in errors)

    def test_no_uppercase(self):
        errors = validate_password_strength("alllowercase1!")
        assert any("mayúscula" in e for e in errors)

    def test_no_lowercase(self):
        errors = validate_password_strength("ALLUPPER1!")
        assert any("minúscula" in e for e in errors)

    def test_no_digit(self):
        errors = validate_password_strength("NoDigitsHere!")
        assert any("número" in e for e in errors)

    def test_no_special(self):
        errors = validate_password_strength("NoSpecialChar1")
        assert any("especial" in e for e in errors)

    def test_valid_password(self):
        errors = validate_password_strength("Secure@Pass123")
        assert errors == []

    def test_multiple_errors(self):
        errors = validate_password_strength("short")
        assert len(errors) >= 3
