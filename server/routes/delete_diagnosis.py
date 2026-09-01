"""
server/routes/delete_diagnosis.py
---------------------------------------------------------
POST /history/remove
Authorization: Bearer <token>

Body:
{
    "diagnosis_id": "D00001"
}
---------------------------------------------------------
"""
import sys
import os

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.routes._helpers import read_json_body, send_json, send_error, require_auth
from server.database import queries


def handle(handler):
    session = require_auth(handler)
    if session is None:
        return

    data = read_json_body(handler)
    if not data or "diagnosis_id" not in data:
        send_error(handler, 400, "Missing diagnosis_id.")
        return

    diagnosis_id = data["diagnosis_id"]
    user_id = session.get("user_id")
    role = session.get("role", "")

    try:
        deleted = queries.delete_diagnosis(diagnosis_id, user_id, role)
        if deleted:
            send_json(handler, 200, {"success": True, "message": "Record deleted successfully."})
        else:
            send_error(handler, 404, "Record not found or unauthorized to delete.")
    except Exception as exc:
        send_error(handler, 500, f"Database error: {exc}")
