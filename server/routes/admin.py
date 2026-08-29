"""Administrator user-management and audit endpoints."""
from server.routes._helpers import read_json_body, send_json, send_error, require_admin
from server.database import queries


def handle_users(handler):
    if require_admin(handler) is None:
        return
    send_json(handler, 200, {"success": True, "users": queries.list_managed_users()})


def handle_status(handler):
    if require_admin(handler) is None:
        return
    data = read_json_body(handler)
    if not data or data.get("user_id") is None:
        send_error(handler, 400, "user_id is required.")
        return
    status = str(data.get("status", "")).lower()
    if status not in ("approved", "suspended", "revoked"):
        send_error(handler, 400, "status must be approved, suspended, or revoked.")
        return
    updated = queries.update_account_status(data["user_id"], status)
    if not updated:
        send_error(handler, 404, "Doctor or researcher account not found.")
        return
    send_json(handler, 200, {"success": True, "status": status})


def handle_login_history(handler):
    if require_admin(handler) is None:
        return
    send_json(handler, 200, {"success": True, "events": queries.get_login_history()})


def handle_stats(handler):
    if require_admin(handler) is None:
        return
    send_json(handler, 200, {"success": True, **queries.get_admin_stats()})