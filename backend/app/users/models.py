# -*- coding: utf-8 -*-
"""Modelos SQLAlchemy: User, Company, UserVaultAssignment."""

from datetime import datetime
import enum

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class UserRole(str, enum.Enum):
    admin = "admin"
    operations = "operations"
    data_science = "data_science"
    etv = "etv"


class UserType(str, enum.Enum):
    internal = "internal"
    external = "external"


class Company(Base):
    """
    ETVs (transportadoras de valores): PanAmericano, GSI, etc.
    El campo company_id en User y Vault hace referencia a esta tabla como ETV.
    """

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    users: Mapped[list["User"]] = relationship("User", back_populates="company")
    empresas: Mapped[list["Empresa"]] = relationship("Empresa", back_populates="etv")


class Empresa(Base):
    """
    Sub-empresas dentro de una ETV.
    Ej: GSI → Cometra, Seguritec, Sepsa, Tecnoval.
    PanAmericano → PanAmericano.
    """

    __tablename__ = "empresas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    etv_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id"), nullable=False, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    etv: Mapped["Company"] = relationship("Company", back_populates="empresas")


class EtvSubrole(str, enum.Enum):
    """Sub-rol dentro del rol etv. Permisos idénticos por ahora; queda preparado
    para diferenciarlos a futuro."""
    gerente = "gerente"
    tesorero = "tesorero"


class User(Base):
    """Usuarios del sistema (internos y ETVs)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="user_role"), nullable=False
    )
    user_type: Mapped[UserType] = mapped_column(
        Enum(UserType, name="user_type"), nullable=False
    )
    company_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("companies.id"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("empresas.id"), nullable=True
    )
    puesto: Mapped[str | None] = mapped_column(String(150), nullable=True)
    etv_subrole: Mapped["EtvSubrole | None"] = mapped_column(
        Enum(EtvSubrole, name="etv_subrole"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False
    )
    failed_login_attempts: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False
    )
    locked_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    company: Mapped["Company | None"] = relationship("Company", back_populates="users")
    empresa: Mapped["Empresa | None"] = relationship("Empresa", foreign_keys=[empresa_id])
    vault_assignments: Mapped[list["UserVaultAssignment"]] = relationship(
        "UserVaultAssignment", back_populates="user"
    )


class UserVaultAssignment(Base):
    """Relación M:N entre usuarios ETV y bóvedas."""

    __tablename__ = "user_vault_assignments"
    __table_args__ = (UniqueConstraint("user_id", "vault_id", name="uq_user_vault"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    vault_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("vaults.id"), nullable=False, index=True
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="vault_assignments")
