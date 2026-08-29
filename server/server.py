"""
server/server.py
---------------------------------------------------------
Entry point for the Explainable AI Medical Backend Server.

Design:
  - socketserver.ThreadingMixIn  → each request handled in its own thread
  - Models loaded ONCE at startup; server refuses to start if any fail
  - Per-request logging: method, path, status code, elapsed ms
  - CORS headers on every response (Access-Control-Allow-Origin: *)
  - Port 8080 (fallback to PORT env var or 8081 if 8080 is occupied by system service)

Run from the project root:
    python server/server.py

Or from inside server/:
    python server.py
---------------------------------------------------------
"""

import sys
import os
import time
import socketserver
from http.server import HTTPServer, BaseHTTPRequestHandler

# ── Path fix: works whether run from project root or from server/ ─────────
_THIS_FILE    = os.path.abspath(__file__)
_SERVER_DIR   = os.path.dirname(_THIS_FILE)
_PROJECT_ROOT = os.path.dirname(_SERVER_DIR)

if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)
if _SERVER_DIR in sys.path:
    sys.path.remove(_SERVER_DIR)

from server import models_store, otp_service


def main():
    models_store.load_all_models()
    otp_service.check_smtp_config()


# ── Threaded HTTP server ───────────────────────────────────────────────────

class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    """Handles each request in a new thread."""
    daemon_threads = True
    allow_reuse_address = True


# ── Request-logging wrapper ───────────────────────────────────────────────

class LoggingHandler(BaseHTTPRequestHandler):
    """
    Thin wrapper that times every request and logs:
        METHOD  /path  →  STATUS  (Xms)
    Actual routing delegated to server.api_handler.APIHandler logic.
    """

    def log_message(self, fmt, *args):
        pass   # suppress built-in logging; we do our own below

    def _log_request(self, status: int, elapsed_ms: float):
        method = self.command if hasattr(self, "command") else "?"
        path   = self.path    if hasattr(self, "path")    else "?"
        print(f"  {method:7s}  {path:40s}  {status}  ({elapsed_ms:.1f}ms)")

    def _timed_dispatch(self, method: str):
        t0 = time.perf_counter()
        self._last_status = 200
        _real_send_response = self.send_response

        def _capturing_send_response(code, message=None):
            self._last_status = code
            _real_send_response(code, message)

        self.send_response = _capturing_send_response
        try:
            from server.api_handler import APIHandler
            APIHandler._dispatch(self, method)
        finally:
            elapsed = (time.perf_counter() - t0) * 1000
            self._log_request(self._last_status, elapsed)

    def do_OPTIONS(self):
        t0 = time.perf_counter()
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        elapsed = (time.perf_counter() - t0) * 1000
        self._log_request(200, elapsed)

    def do_GET(self):
        self._timed_dispatch("GET")

    def do_POST(self):
        self._timed_dispatch("POST")


HOST = "0.0.0.0"
DEFAULT_PORT = int(os.getenv("PORT", "8080"))


def main():
    models_store.load_all_models()

    port = DEFAULT_PORT
    server = None

    # Try binding to requested PORT (8080). If OS denies permissions (WinError 10013 / system service conflict),
    # fallback to 8081 so the server can run without crashing.
    for attempt_port in [port, 8081, 8082, 5000]:
        try:
            server = ThreadedHTTPServer((HOST, attempt_port), LoggingHandler)
            port = attempt_port
            break
        except OSError as exc:
            if attempt_port == 5000:
                raise exc
            print(f"[server] Warning: Port {attempt_port} bound/restricted ({exc}). Trying alternate port...")

    print(f"[server] Explainable AI Medical Server  →  http://localhost:{port}")
    print(f"[server] Available routes:")
    routes = [
        ("POST", "/register/request-otp"),
        ("POST", "/register/verify-otp"),
        ("POST", "/login"),
        ("POST", "/logout"),
        ("POST", "/forgot-password/request-otp"),
        ("POST", "/forgot-password/reset"),
        ("POST", "/predict"),
        ("GET",  "/explain?id=<diagnosis_id>"),
        ("POST", "/whatif"),
        ("GET",  "/history"),
        ("GET",  "/report?id=<diagnosis_id>"),
        ("GET",  "/admin/users"),
        ("POST", "/admin/users/status"),
        ("GET",  "/admin/login-history"),
        ("GET",  "/admin/stats"),
    ]
    for method, path in routes:
        print(f"  {method:6s}  http://localhost:{port}{path}")
    print(f"\n[server] Press Ctrl+C to stop.\n")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[server] Shutting down.")
        server.server_close()


if __name__ == "__main__":
    main()
