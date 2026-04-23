"""Notificaciones y reportes de error

Revision ID: 006
Revises: 005
Create Date: 2026-04-22

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOTIFICATION_TYPES = (
    "arqueo_published", "correction_made", "missing_arqueo", "weekend_upload",
    "negative_balance", "excess_certificates", "vault_reactivated",
    "password_reset", "error_reported", "error_response", "general"
)

ERROR_REPORT_STATUSES = ("open", "acknowledged", "resolved", "closed")


def upgrade() -> None:
    # ── notifications ──────────────────────────────────────────────────────────
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("recipient_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("sender_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "notification_type",
            sa.Enum(*NOTIFICATION_TYPES, name="notification_type"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=True),
        sa.Column("entity_id", sa.Integer, nullable=True),
        sa.Column("is_read", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_notif_recipient", "notifications", ["recipient_id"])
    op.create_index(
        "ix_notif_recipient_unread", "notifications", ["recipient_id", "is_read"]
    )

    # ── error_reports ──────────────────────────────────────────────────────────
    op.create_table(
        "error_reports",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("reported_by", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("assigned_to", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "arqueo_header_id",
            sa.Integer,
            sa.ForeignKey("arqueo_headers.id"),
            nullable=True,
        ),
        sa.Column(
            "status",
            sa.Enum(*ERROR_REPORT_STATUSES, name="error_report_status"),
            nullable=False,
            server_default="open",
        ),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("response", sa.Text, nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_error_report_assigned", "error_reports", ["assigned_to"])
    op.create_index("ix_error_report_status", "error_reports", ["status"])

    # ── error_report_records ───────────────────────────────────────────────────
    op.create_table(
        "error_report_records",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column(
            "error_report_id",
            sa.Integer,
            sa.ForeignKey("error_reports.id"),
            nullable=False,
        ),
        sa.Column(
            "arqueo_record_id",
            sa.Integer,
            sa.ForeignKey("arqueo_records.id"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("error_report_records")
    op.drop_index("ix_error_report_status", table_name="error_reports")
    op.drop_index("ix_error_report_assigned", table_name="error_reports")
    op.drop_table("error_reports")
    op.drop_index("ix_notif_recipient_unread", table_name="notifications")
    op.drop_index("ix_notif_recipient", table_name="notifications")
    op.drop_table("notifications")
    op.execute("DROP TYPE IF EXISTS error_report_status")
    op.execute("DROP TYPE IF EXISTS notification_type")
