"""
server/routes/login.py
---------------------------------------------------------
POST /login
Body: {"email", "password"}
Response (200): {"success": true, "token", "role", "user_id", "name"}
Response (401): {"success": false, "error": "Invalid email or password."}
---------------------------------------------------------
"""
from server.routes._helpers import read_json_body, send_json, send_error
from server import auth as auth_module


def handle(handler):
    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    result = auth_module.login_user(
        email=data.get("email", ""),
        password=data.get("password", ""),
        ip_address=handler.client_address[0] if handler.client_address else None,
    )

    if "error" in result:
        # Wrong credentials → 401 (not 200 with success:false)
        send_error(handler, 401, result["error"])
    else:
        send_json(handler, 200, result)
