"""
server/auth.py
---------------------------------------------------------
Authentication module.

Provides two flows:
  1. OTP-based registration  (register_step1 / register_step2)
  2. Login / session management
  3. OTP-based forgot-password  (forgot_password_request_otp / forgot_password_reset)

Password hashing: salted SHA-256 via Python's built-in hashlib + secrets.
Session store:    in-memory dict {token: user_dict}  (server-restart resets sessions).

CRITICAL: do NOT import Flask, Django or any external auth library.
---------------------------------------------------------
"""

import hashlib
import hmac
import secrets

from server.database import queries
from server import otp_service

# ── In-memory session store: token -> user_dict ───────────────────────────
SESSIONS: dict = {}


# ─────────────────────────────────────────────────────────────────────────
# Password helpers
# ─────────────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    """Hash a password with a random 16-byte salt using SHA-256.

    Returns:  "<hex_salt>$<hex_digest>"
    """
    salt = secrets.token_hex(16)
    digest = hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Return True iff *password* matches the stored salted hash."""
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        salt, expected = stored_hash.split("$", 1)
        computed = hashlib.sha256(f"{salt}{password}".encode("utf-8")).hexdigest()
        return hmac.compare_digest(computed, expected)
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────
# Registration — two-step OTP flow
# ─────────────────────────────────────────────────────────────────────────

def register_step1_request_otp(name: str, email: str, password: str,
                                role: str, institution: str | None = None) -> dict:
    """
    Step 1 of registration: validate inputs, check email not already
    registered, hash the password, generate an OTP and store everything
    in the pending-registration store.

    Returns:
        {"success": True, "message": "Verification code sent to your email."}
        or {"error": "<reason>"}  on validation failure.
    """
    name = (name or "").strip()
    email = (email or "").strip().lower()
    role = (role or "").strip().lower()

    # ── Input validation ──
    if not name or not email or not password or not role:
        return {"error": "name, email, password and role are all required."}

    if "@" not in email:
        return {"error": "email must contain '@'."}

    if len(password) < 8:
        return {"error": "password must be at least 8 characters."}

    valid_roles = ("doctor", "admin", "researcher")
    if role not in valid_roles:
        return {"error": f"role must be one of {list(valid_roles)}."}

    # ── Duplicate check ──
    existing = queries.get_user_by_email(email)
    if existing:
        return {"error": "An account with that email address already exists."}

    # ── Store OTP + hashed password ──
    pwd_hash = hash_password(password)
    otp_service.store_registration_otp(
        email=email,
        name=name,
        password_hash=pwd_hash,
        role=role,
        institution=institution,
    )

    return {"success": True, "message": "Verification code sent to your email."}


def register_step2_confirm_otp(email: str, otp: str) -> dict:
    """
    Step 2 of registration: verify OTP, create the user in MySQL.

    Returns:
        {"success": True, "user_id": <int>}
        or {"error": "<reason>"}
    """
    email = (email or "").strip().lower()
    otp = (otp or "").strip()

    if not email or not otp:
        return {"error": "email and otp are required."}

    try:
        pending = otp_service.verify_registration_otp(email, otp)
    except ValueError as exc:
        return {"error": str(exc)}

    try:
        user_id = queries.create_user(
            name=pending["name"],
            email=email,
            password_hash=pending["password_hash"],
            role=pending["role"],
            institution=pending["institution"],
        )
    except Exception as exc:
        return {"error": f"Failed to create account: {exc}"}

    return {"success": True, "user_id": user_id}


# ─────────────────────────────────────────────────────────────────────────
# Login / session management
# ─────────────────────────────────────────────────────────────────────────

def login_user(email: str, password: str, ip_address=None) -> dict:
    """
    Authenticate with email + password.  Creates a session token on success.

    Returns:
        {"success": True, "token": "...", "role": "...", "user_id": int, "name": "..."}
        or {"error": "Invalid email or password."}
    """
    email = (email or "").strip().lower()

    if not email or not password:
        return {"error": "email and password are required."}

    user = queries.get_user_by_email(email)
    if not user or not verify_password(password, user["password_hash"]):
        queries.record_login_event(email, user_id=user.get("user_id") if user else None,
                                   role=user.get("role") if user else None,
                                   successful=False, ip_address=ip_address)
        return {"error": "Invalid email or password."}

    if user.get("account_status", "approved") != "approved":
        queries.record_login_event(email, user_id=user["user_id"], role=user["role"],
                                   successful=False, ip_address=ip_address)
        return {"error": "This account is not currently permitted to access the platform."}

    token = secrets.token_hex(32)
    session_data = {
        "user_id":     user["user_id"],
        "name":        user["name"],
        "email":       user["email"],
        "role":        user["role"],
        "institution": user.get("institution"),
    }
    SESSIONS[token] = session_data
    queries.record_login_event(email, user_id=user["user_id"], role=user["role"],
                               successful=True, ip_address=ip_address)

    return {
        "success": True,
        "token":   token,
        "role":    user["role"],
        "user_id": user["user_id"],
        "name":    user["name"],
    }


def validate_session(token: str) -> dict | None:
    """Return the session user-dict for *token*, or None if invalid/absent."""
    if not token:
        return None
    return SESSIONS.get(token)


def logout_user(token: str) -> bool:
    """Invalidate *token*.  Returns True if it existed, False if not."""
    return SESSIONS.pop(token, None) is not None


# ─────────────────────────────────────────────────────────────────────────
# Forgot-password — two-step OTP flow
# ─────────────────────────────────────────────────────────────────────────

def forgot_password_request_otp(email: str) -> dict:
    """
    Request a password-reset OTP for *email*.

    Always returns the same generic success message regardless of
    whether the email exists (to prevent user-enumeration).
    If the email exists, an OTP is generated and printed/emailed.
    """
    email = (email or "").strip().lower()
    GENERIC_MSG = "If an account with that email exists, a reset code has been sent."

    if not email or "@" not in email:
        return {"error": "A valid email address is required."}

    user = queries.get_user_by_email(email)
    if user:
        otp_service.store_reset_otp(email)

    return {"success": True, "message": GENERIC_MSG}


def forgot_password_reset(email: str, otp: str, new_password: str) -> dict:
    """
    Verify the reset OTP and update the password in MySQL.
    Also invalidates ALL existing sessions for this user (security).

    Returns:
        {"success": True, "message": "Password updated successfully."}
        or {"error": "<reason>"}
    """
    email = (email or "").strip().lower()
    otp = (otp or "").strip()
    new_password = new_password or ""

    if not email or not otp or not new_password:
        return {"error": "email, otp and new_password are all required."}

    if len(new_password) < 8:
        return {"error": "new_password must be at least 8 characters."}

    try:
        otp_service.verify_reset_otp(email, otp)
    except ValueError as exc:
        return {"error": str(exc)}

    new_hash = hash_password(new_password)
    updated = queries.update_user_password(email, new_hash)

    if not updated:
        return {"error": "No account found with that email address."}

    otp_service.clear_reset_otp(email)

    # Invalidate all existing sessions for this user (security)
    tokens_to_remove = [
        t for t, s in SESSIONS.items()
        if s.get("email") == email
    ]
    for t in tokens_to_remove:
        SESSIONS.pop(t, None)

    return {"success": True, "message": "Password updated successfully."}
