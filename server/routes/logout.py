"""
server/routes/logout.py
---------------------------------------------------------
POST /logout
Header: Authorization: Bearer <token>
Response: {"success": true}
---------------------------------------------------------
"""
from server.routes._helpers import read_json_body, send_json
from server import auth as auth_module


def handle(handler):
    auth_header = handler.headers.get("Authorization", "")
    token = auth_header[7:].strip() if auth_header.startswith("Bearer ") else ""
    auth_module.logout_user(token)
    # Always return success (idempotent — logging out a non-existent token is fine)
    send_json(handler, 200, {"success": True})
