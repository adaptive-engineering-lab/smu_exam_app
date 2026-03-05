"""Email utilities for password reset."""

import smtplib
from email.mime.text import MIMEText

from app.core.config import settings


def send_reset_email(to_email: str, reset_link: str) -> None:
    msg = MIMEText(
        f"Hello,\n\nClick the link below to reset your SMU Exam password:\n\n{reset_link}\n\n"
        "This link expires in 15 minutes. If you did not request a password reset, ignore this email."
    )
    msg["Subject"] = "SMU Exam — Password Reset"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email

    with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(settings.smtp_from, [to_email], msg.as_string())
