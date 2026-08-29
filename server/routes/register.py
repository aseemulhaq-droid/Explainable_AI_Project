"""
server/routes/register.py
---------------------------------------------------------
POST /register/request-otp
POST /register/verify-otp
---------------------------------------------------------
"""
from server.routes._helpers import read_json_body, send_json, send_error
from server import auth as auth_module


def handle_request_otp(handler):
    """
    POST /register/request-otp
    Body: {"name", "email", "password", "role", "institution"}
    """
    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    result = auth_module.register_step1_request_otp(
        name=data.get("name", ""),
        email=data.get("email", ""),
        password=data.get("password", ""),
        role=data.get("role", ""),
        institution=data.get("institution"),
    )

    if "error" in result:
        send_error(handler, 400, result["error"])
    else:
        send_json(handler, 200, result)


def handle_verify_otp(handler):
    """
    POST /register/verify-otp
    Body: {"email", "otp"}
    """
    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    result = auth_module.register_step2_confirm_otp(
        email=data.get("email", ""),
        otp=str(data.get("otp", "")),
    )

    if "error" in result:
        send_error(handler, 400, result["error"])
    else:
        send_json(handler, 201, result)
