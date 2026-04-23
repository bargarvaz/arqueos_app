# -*- coding: utf-8 -*-
"""Servicio de envío de emails (OTP y notificaciones de sistema)."""

import logging
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from app.config import settings

logger = logging.getLogger(__name__)


async def send_otp_email(recipient_email: str, recipient_name: str, otp_code: str) -> bool:
    """
    Envía el código OTP al email del usuario ETV.

    Returns:
        True si se envió correctamente, False si falló.
    """
    subject = "Código de verificación — Sistema Arqueos"
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4A5D23; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Sistema de Arqueos</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
            <p>Hola <strong>{recipient_name}</strong>,</p>
            <p>Tu código de verificación es:</p>
            <div style="text-align: center; margin: 30px 0;">
                <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px;
                             color: #4A5D23; background: #eee; padding: 15px 30px;
                             border-radius: 8px; font-family: monospace;">
                    {otp_code}
                </span>
            </div>
            <p>Este código es válido por <strong>5 minutos</strong>.</p>
            <p>Si no solicitaste este código, ignora este mensaje.</p>
        </div>
        <div style="padding: 15px; text-align: center; color: #888; font-size: 12px;">
            Sistema de Gestión de Arqueos Bancarios — Uso exclusivo interno
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.otp_email_from
    msg["To"] = recipient_email
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.otp_email_host,
            port=settings.otp_email_port,
            username=settings.otp_email_user,
            password=settings.otp_email_password,
            start_tls=True,
        )
        logger.info("OTP enviado a %s", recipient_email)
        return True
    except Exception as exc:
        logger.error("Error enviando OTP a %s: %s", recipient_email, exc)
        return False


async def send_password_reset_notification(
    recipient_email: str,
    recipient_name: str,
    temp_password: str,
) -> bool:
    """Notifica al usuario que su contraseña fue restablecida."""
    subject = "Contraseña restablecida — Sistema Arqueos"
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #4A5D23; padding: 20px; text-align: center;">
            <h1 style="color: white; margin: 0;">Sistema de Arqueos</h1>
        </div>
        <div style="padding: 30px; background: #f9f9f9;">
            <p>Hola <strong>{recipient_name}</strong>,</p>
            <p>Un administrador ha restablecido tu contraseña.</p>
            <p>Tu contraseña temporal es:</p>
            <div style="text-align: center; margin: 20px 0;">
                <code style="font-size: 18px; background: #eee; padding: 10px 20px;
                             border-radius: 4px; display: inline-block;">
                    {temp_password}
                </code>
            </div>
            <p>Al iniciar sesión, el sistema te pedirá que establezcas una nueva contraseña.</p>
            <p><strong>Por seguridad, cambia tu contraseña inmediatamente.</strong></p>
        </div>
    </body>
    </html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.otp_email_from
    msg["To"] = recipient_email
    msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.otp_email_host,
            port=settings.otp_email_port,
            username=settings.otp_email_user,
            password=settings.otp_email_password,
            start_tls=True,
        )
        return True
    except Exception as exc:
        logger.error("Error enviando notif. reset a %s: %s", recipient_email, exc)
        return False
