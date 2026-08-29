"""
server/api_handler.py
---------------------------------------------------------
Central HTTP request dispatcher.

ROUTE TABLE:
  POST  /register/request-otp       → routes/register.py
  POST  /register/verify-otp        → routes/register.py
  POST  /login                      → routes/login.py
  POST  /logout                     → routes/logout.py
  POST  /forgot-password/request-otp → routes/forgot_password.py
  POST  /forgot-password/reset       → routes/forgot_password.py
  POST  /predict                     → routes/predict.py
  GET   /explain                     → routes/explain.py
  POST  /whatif                      → routes/whatif.py
  GET   /history                     → routes/history.py
  GET   /report                      → routes/report.py

Error shapes:
  404  {"error": "Route not found"}
  405  {"error": "Method not allowed"}
---------------------------------------------------------
"""

import sys
import os
import json
import time
from http.server import BaseHTTPRequestHandler

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

# Import every route module
from server.routes import register       as register_route
from server.routes import login          as login_route
from server.routes import logout         as logout_route
from server.routes import forgot_password as forgot_route
from server.routes import predict        as predict_route
from server.routes import explain        as explain_route
from server.routes import whatif         as whatif_route
from server.routes import history        as history_route
from server.routes import report         as report_route
from server.routes import dev_login      as dev_login_route
from server.routes import admin          as admin_route

# ---------------------------------------------------------------------------
# ROUTE TABLE  →  (METHOD, PATH) : handler_fn(handler)
# ---------------------------------------------------------------------------
ROUTE_TABLE = {
    ("POST", "/register/request-otp"):        register_route.handle_request_otp,
    ("POST", "/register/verify-otp"):         register_route.handle_verify_otp,
    ("POST", "/login"):                        login_route.handle,
    ("POST", "/logout"):                       logout_route.handle,
    ("POST", "/forgot-password/request-otp"): forgot_route.handle_request_otp,
    ("POST", "/forgot-password/reset"):        forgot_route.handle_reset,
    ("POST", "/predict"):                      predict_route.handle,
    ("GET",  "/explain"):                      explain_route.handle,
    ("POST", "/whatif"):                       whatif_route.handle,
    ("GET",  "/history"):                      history_route.handle,
    ("GET",  "/report"):                       report_route.handle,
    ("POST", "/dev-login"):                     dev_login_route.handle,
    ("GET",  "/admin/users"):                   admin_route.handle_users,
    ("POST", "/admin/users/status"):            admin_route.handle_status,
    ("GET",  "/admin/login-history"):           admin_route.handle_login_history,
    ("GET",  "/admin/stats"):                   admin_route.handle_stats,
}

_ALL_PATHS = {path for (_, path) in ROUTE_TABLE}


class APIHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # suppressed; server.py LoggingHandler does logging

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    # -----------------------------------------------------------------------
    def _dispatch(self, method: str):
        clean_path = self.path.split("?")[0].rstrip("/") or "/"
        key = (method, clean_path)
        handler_fn = ROUTE_TABLE.get(key)

        if handler_fn is None:
            if clean_path in _ALL_PATHS:
                self._send_error(405, "Method not allowed")
            else:
                self._send_error(404, "Route not found")
            return

        try:
            handler_fn(self)
        except Exception as exc:
            import traceback
            traceback.print_exc()
            self._send_error(500, f"Internal server error: {exc}")

    # -----------------------------------------------------------------------
    def _send_json(self, status: int, payload: dict):
        body = json.dumps(payload, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _send_error(self, status: int, message: str):
        self._send_json(status, {"success": False, "error": message})
