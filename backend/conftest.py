# -*- coding: utf-8 -*-
"""
Fixtures compartidas para tests del backend.

Nota: las pruebas de esta suite son mayoritariamente unitarias (sin base de datos real).
Para tests de integración con DB real se requiere una instancia PostgreSQL de prueba y
la variable de entorno TEST_DATABASE_URL configurada.
"""

import pytest


def pytest_configure(config):
    """Registra marks custom para no generar warnings."""
    config.addinivalue_line("markers", "integration: mark test as integration (requires DB)")
    config.addinivalue_line("markers", "slow: mark test as slow")
