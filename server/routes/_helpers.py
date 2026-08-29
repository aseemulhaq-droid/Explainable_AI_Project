"""
server/routes/_helpers.py
---------------------------------------------------------
Shared utilities used by all route handlers.
---------------------------------------------------------
"""
import json
import sys
import os

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server import auth as auth_module


def read_json_body(handler) -> dict | None:
    """Read and parse the JSON request body.  Returns None on failure."""
    try:
        length = int(handler.headers.get("Content-Length", 0))
        raw = handler.rfile.read(length)
        return json.loads(raw) if raw else {}
    except Exception:
        return None


def send_json(handler, status: int, payload: dict):
    """Send a JSON response with CORS headers."""
    body = json.dumps(payload, default=str).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def send_error(handler, status: int, message: str):
    send_json(handler, status, {"success": False, "error": message})


def require_auth(handler) -> dict | None:
    """
    Extract Bearer token from Authorization header and validate it.
    Returns the session dict on success.
    Sends a 401 and returns None on failure.
    """
    auth_header = handler.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:].strip()

    session = auth_module.validate_session(token)
    if not session:
        send_error(handler, 401, "Unauthorized: missing or invalid session token.")
        return None
    return session


def require_admin(handler) -> dict | None:
    """Require an authenticated administrator session."""
    session = require_auth(handler)
    if session is None:
        return None
    if str(session.get("role", "")).lower() != "admin":
        send_error(handler, 403, "Administrator access required.")
        return None
    return session
