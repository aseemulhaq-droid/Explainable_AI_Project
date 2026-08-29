"""
server/routes/explain.py
---------------------------------------------------------
GET /explain?id=<diagnosis_id>
Authorization: Bearer <token>  (required)

Re-fetches the diagnosis features from MySQL,
re-runs LIME explain_prediction(), saves new lime_scores rows,
returns {"diagnosis_id", "lime_scores": [{"feature","score"}]}.
---------------------------------------------------------
"""
import sys
import os
import numpy as np
from urllib.parse import urlparse, parse_qs

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.routes._helpers import send_json, send_error, require_auth
from server.database import queries
from models.lime_explainer import explain_prediction
from server import models_store


def handle(handler):
    session = require_auth(handler)
    if session is None:
        return

    # Parse ?id= query param
    parsed = urlparse(handler.path)
    params = parse_qs(parsed.query)
    diag_id_raw = params.get("id", [None])[0]

    if not diag_id_raw:
        send_error(handler, 400, "Query parameter 'id' is required. Example: /explain?id=D00001")
        return

    # Fetch diagnosis from DB
    detail = queries.get_diagnosis_detail(diag_id_raw)
    if detail is None:
        send_error(handler, 404, f"Diagnosis '{diag_id_raw}' not found.")
        return

    disease = detail.get("disease", "").lower()
    if disease not in models_store.LOADED_MODELS:
        send_error(handler, 400, f"Unknown disease '{disease}' in stored diagnosis.")
        return

    # Reconstruct normalised feature vector from stored feature_inputs
    features_stored = detail.get("features", [])  # list of {feature, value, status}
    if not features_stored:
        send_error(handler, 400, "No feature inputs found for this diagnosis — cannot run LIME.")
        return

    norm = models_store.NORM_PARAMS[disease]
    feature_names = norm["feature_names"]
    col_min  = norm["col_min"]
    col_max  = norm["col_max"]
    denom = np.where((col_max - col_min) == 0, 1.0, col_max - col_min)

    # Build a lookup from stored features
    feat_lookup = {row["feature"].lower(): float(row["value"]) for row in features_stored}

    raw = np.array(
        [feat_lookup.get(f, 0.0) for f in feature_names],
        dtype=float
    )
    X_norm = np.clip((raw - col_min) / denom, 0.0, 1.0)

    # Run LIME
    try:
        nn = models_store.LOADED_MODELS[disease]
        lime_results, elapsed = explain_prediction(
            nn, X_norm, feature_names, num_samples=500, seed=42
        )
    except Exception as exc:
        send_error(handler, 500, f"LIME failed: {exc}")
        return

    # Persist lime_scores (replace any existing rows for this diagnosis)
    diag_id_int = detail["diagnosis_id"]
    try:
        queries.save_lime_scores(diag_id_int, lime_results)
    except Exception:
        pass  # Already saved from a prior call — not fatal

    # Build response including full diagnosis detail so frontend can display patient results
    response = {
        "success":      True,
        "diagnosis_id": detail["formatted_id"],
        "patient_name": detail.get("patient_name"),
        "disease":      detail.get("disease"),
        "result":       detail.get("result"),
        "confidence":   detail.get("confidence"),
        "risk_level":   detail.get("risk_level"),
        "date":         detail.get("date"),
        "features":     detail.get("features", []),
        "lime_scores":  [{"feature": r["feature"], "score": r["score"]} for r in lime_results],
        "elapsed_ms":   round(elapsed * 1000, 1),
    }

    send_json(handler, 200, response)
