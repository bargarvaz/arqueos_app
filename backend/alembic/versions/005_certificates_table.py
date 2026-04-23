"""Documentos: certificates

Revision ID: 005
Revises: 004
Create Date: 2026-04-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "certificates",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "arqueo_header_id",
            sa.Integer,
            sa.ForeignKey("arqueo_headers.id"),
            nullable=False,
        ),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("minio_bucket", sa.String(100), nullable=False),
        sa.Column("minio_key", sa.String(500), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger, nullable=True),
        sa.Column(
            "content_type",
            sa.String(100),
            nullable=False,
            server_default="application/pdf",
        ),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "uploaded_by",
            sa.Integer,
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_cert_header_id", "certificates", ["arqueo_header_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_cert_header_id", table_name="certificates")
    op.drop_table("certificates")
