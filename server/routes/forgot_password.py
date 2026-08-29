"""
server/routes/forgot_password.py
---------------------------------------------------------
POST /forgot-password/request-otp
POST /forgot-password/reset
---------------------------------------------------------
"""
from server.routes._helpers import read_json_body, send_json, send_error
from server import auth as auth_module


def handle_request_otp(handler):
    """
    POST /forgot-password/request-otp
    Body: {"email"}
    Always returns generic success (to prevent user-enumeration).
    """
    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    result = auth_module.forgot_password_request_otp(
        email=data.get("email", ""),
    )

    if "error" in result:
        send_error(handler, 400, result["error"])
    else:
        send_json(handler, 200, result)


def handle_reset(handler):
    """
    POST /forgot-password/reset
    Body: {"email", "otp", "new_password"}
    Response: {"success": true, "message": "Password updated successfully."}
    """
    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    result = auth_module.forgot_password_reset(
        email=data.get("email", ""),
        otp=str(data.get("otp", "")),
        new_password=data.get("new_password", ""),
    )

    if "error" in result:
        send_error(handler, 400, result["error"])
    else:
        send_json(handler, 200, result)
