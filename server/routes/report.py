"""
server/routes/report.py
---------------------------------------------------------
GET /report?id=<diagnosis_id>
Returns 501 Not Implemented — see Task 5.
---------------------------------------------------------
"""
from server.routes._helpers import send_json


def handle(handler):
    send_json(handler, 501, {
        "success": False,
        "error":   "Not yet implemented - see Task 5",
    })
