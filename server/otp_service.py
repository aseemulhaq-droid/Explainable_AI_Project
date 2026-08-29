"""
server/otp_service.py
---------------------------------------------------------
One-Time Password (OTP) service for registration and
forgot-password flows with real Gmail SMTP support.

Features:
- Generates 6-digit numeric codes using secrets.randbelow.
- Checks GMAIL_ADDRESS and GMAIL_APP_PASSWORD env vars.
- If present: sends real emails using smtplib.SMTP_SSL on port 465.
- If missing / failed: prints a clear [WARNING] and falls back to console log.
---------------------------------------------------------
"""

import secrets
import time
import json
import os
import smtplib
from email.message import EmailMessage

OTP_TTL_SECONDS = 600   # 10 minutes

_PENDING_REGISTRATIONS: dict = {}
_RESET_OTPS: dict = {}

_HIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "history"))
os.makedirs(_HIST_DIR, exist_ok=True)
_OTP_LOG_FILE = os.path.join(_HIST_DIR, "latest_otp.json")


def check_smtp_config():
    """Check if Gmail env vars are present and print startup status/warnings."""
    gmail_address = os.getenv("GMAIL_ADDRESS")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD")
    if not gmail_address or not gmail_password:
        print(
            "[WARNING] Gmail credentials not found - OTP emails will NOT be sent.\n"
            "          Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables before starting the server.",
            flush=True
        )
    else:
        print(f"[OTP SERVICE] Gmail SMTP configured for: {gmail_address}", flush=True)


def _log_otp_to_file(email: str, otp_type: str, otp: str):
    """Write latest OTP to a JSON file so tests / dev scripts can read it."""
    try:
        data = {}
        if os.path.exists(_OTP_LOG_FILE):
            try:
                with open(_OTP_LOG_FILE, "r") as f:
                    data = json.load(f)
            except Exception:
                data = {}
        data[email.lower()] = {
            "type": otp_type,
            "otp": otp,
            "timestamp": time.time()
        }
        with open(_OTP_LOG_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"[OTP SERVICE] Could not write OTP to log file: {e}", flush=True)


def _generate_otp() -> str:
    """Return a 6-digit zero-padded OTP string."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _send_email_or_fallback(email: str, otp: str, subject: str, otp_type_name: str) -> bool:
    """
    Attempt to send email via Gmail SMTP_SSL.
    If env vars are missing or SMTP fails, print warning and fall back to console print.
    """
    gmail_address = os.getenv("GMAIL_ADDRESS")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD")

    _log_otp_to_file(email, otp_type_name.lower(), otp)

    if not gmail_address or not gmail_password:
        print(
            f"\n[WARNING] Gmail credentials not found - OTP emails will NOT be sent.\n"
            f"          Set GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables before starting the server.\n"
            f"[FALLBACK CONSOLE LOG] {otp_type_name} OTP for {email}: {otp} (valid {OTP_TTL_SECONDS//60} min)\n",
            flush=True
        )
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = gmail_address
    msg["To"] = email
    msg.set_content(
        f"Hello,\n\n"
        f"Your verification code for the Explainable AI Medical Diagnosis System is:\n\n"
        f"  {otp}\n\n"
        f"This code will expire in {OTP_TTL_SECONDS//60} minutes.\n"
        f"If you did not request this code, please ignore this email.\n\n"
        f"Best regards,\n"
        f"Explainable AI Medical Team"
    )

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(gmail_address, gmail_password)
            smtp.send_message(msg)
        print(f"[OTP SERVICE] Real OTP email successfully sent via Gmail SMTP to {email}", flush=True)
        return True
    except Exception as exc:
        print(
            f"\n[WARNING] Failed to send email via Gmail SMTP: {exc}\n"
            f"[FALLBACK CONSOLE LOG] {otp_type_name} OTP for {email}: {otp} (valid {OTP_TTL_SECONDS//60} min)\n",
            flush=True
        )
        return False


def store_registration_otp(email: str, name: str, password_hash: str,
                            role: str, institution: str | None) -> str:
    otp = _generate_otp()
    _PENDING_REGISTRATIONS[email.lower()] = {
        "otp":           otp,
        "issued_at":     time.time(),
        "name":          name,
        "password_hash": password_hash,
        "role":          role,
        "institution":   institution,
    }
    
    _send_email_or_fallback(
        email=email,
        otp=otp,
        subject="Explainable AI Medical System - Registration Verification Code",
        otp_type_name="Registration"
    )
    return otp


def verify_registration_otp(email: str, otp: str):
    key = email.lower()
    pending = _PENDING_REGISTRATIONS.get(key)

    if not pending:
        raise ValueError("No pending registration found for this email. Please start registration again.")

    if time.time() - pending["issued_at"] > OTP_TTL_SECONDS:
        del _PENDING_REGISTRATIONS[key]
        raise ValueError("OTP has expired. Please request a new one.")

    if pending["otp"] != otp.strip():
        raise ValueError("Incorrect OTP. Please check the code and try again.")

    del _PENDING_REGISTRATIONS[key]
    return pending


def store_reset_otp(email: str) -> str:
    otp = _generate_otp()
    _RESET_OTPS[email.lower()] = {
        "otp":       otp,
        "issued_at": time.time(),
    }
    
    _send_email_or_fallback(
        email=email,
        otp=otp,
        subject="Explainable AI Medical System - Password Reset Code",
        otp_type_name="Password-Reset"
    )
    return otp


def verify_reset_otp(email: str, otp: str) -> bool:
    key = email.lower()
    record = _RESET_OTPS.get(key)

    if not record:
        raise ValueError("No password-reset request found for this email.")

    if time.time() - record["issued_at"] > OTP_TTL_SECONDS:
        del _RESET_OTPS[key]
        raise ValueError("OTP has expired. Please request a new password-reset code.")

    if record["otp"] != otp.strip():
        raise ValueError("Incorrect OTP. Please check the code and try again.")

    return True


def clear_reset_otp(email: str) -> None:
    _RESET_OTPS.pop(email.lower(), None)
