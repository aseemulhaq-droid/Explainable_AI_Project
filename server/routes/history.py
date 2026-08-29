"""
server/routes/history.py
---------------------------------------------------------
GET /history
Authorization: Bearer <token>  (required)

Doctor role → only their own diagnoses.
Admin/researcher → all diagnoses.
---------------------------------------------------------
"""
from urllib.parse import urlparse, parse_qs
from server.routes._helpers import send_json, send_error, require_auth
from server.database import queries


def handle(handler):
    session = require_auth(handler)
    if session is None:
        return

    parsed = urlparse(handler.path)
    params = parse_qs(parsed.query)
    disease_filter = params.get("disease", [None])[0]
    result_filter  = params.get("result",  [None])[0]

    role    = session["role"]
    user_id = session["user_id"]

    records = queries.get_history(
        user_id=user_id,
        role=role,
        disease_filter=disease_filter,
        result_filter=result_filter,
    )

    # Shape to spec: list of {diagnosis_id, patient_name, disease, result, confidence, risk_level, date}
    out = [
        {
            "diagnosis_id": r["formatted_id"],
            "patient_name": r["patient_name"],
            "disease":      r["disease"],
            "result":       r["result"],
            "confidence":   r["confidence"],
            "risk_level":   r["risk_level"],
            "date":         r["date"],
        }
        for r in records
    ]

    send_json(handler, 200, {"success": True, "records": out})
