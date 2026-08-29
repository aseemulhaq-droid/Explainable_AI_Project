"""
server/routes/whatif.py
---------------------------------------------------------
POST /whatif
Authorization: Bearer <token>  (required)

Live simulation — does NOT save a new diagnosis.
Must respond under 2 seconds total.

Body: {"disease", "features": {...modified values...}}
Response: same shape as /predict + /explain combined.
---------------------------------------------------------
"""
import sys
import os
import time
import numpy as np

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.routes._helpers import read_json_body, send_json, send_error, require_auth
from models.risk_calculator import calculate_feature_flags, calculate_overall_risk
from models.lime_explainer import explain_prediction
from server import models_store

_RISK_MAP = {"EMERGENCY": "RED", "MONITOR": "YELLOW", "SAFE": "GREEN"}


def handle(handler):
    session = require_auth(handler)
    if session is None:
        return

    t_start = time.perf_counter()

    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    disease      = str(data.get("disease") or "").lower().strip()
    raw_features = data.get("features") or {}

    valid_diseases = list(models_store.LOADED_MODELS.keys())
    if disease not in valid_diseases:
        send_error(handler, 400, f"'disease' must be one of {valid_diseases}.")
        return

    if not raw_features:
        send_error(handler, 400, "'features' dict is required.")
        return

    # ── Normalize ────────────────────────────────────────────────────────
    norm = models_store.NORM_PARAMS[disease]
    feature_names = norm["feature_names"]
    col_min  = norm["col_min"]
    col_max  = norm["col_max"]
    denom = np.where((col_max - col_min) == 0, 1.0, col_max - col_min)

    raw = np.array(
        [float(raw_features.get(f, raw_features.get(f.replace("_", ""), 0.0)))
         for f in feature_names],
        dtype=float
    )
    X_norm = np.clip((raw - col_min) / denom, 0.0, 1.0)

    # ── Inference ────────────────────────────────────────────────────────
    nn = models_store.LOADED_MODELS[disease]
    probs, binary     = nn.predict(X_norm.reshape(1, -1))
    confidence_pct    = round(float(probs[0, 0]) * 100, 2)
    result_label      = "DETECTED" if int(binary[0, 0]) == 1 else "NOT_DETECTED"

    # ── Risk flags ───────────────────────────────────────────────────────
    risk_flags   = calculate_feature_flags(disease, raw_features)
    overall_risk = calculate_overall_risk(risk_flags, confidence_pct)
    risk_level   = _RISK_MAP.get(overall_risk, "YELLOW")

    # ── LIME (keep num_samples small for speed under 2s) ─────────────────
    lime_results, lime_elapsed = explain_prediction(
        nn, X_norm, feature_names, num_samples=200, seed=42
    )

    elapsed_total_ms = round((time.perf_counter() - t_start) * 1000, 1)

    send_json(handler, 200, {
        "success":     True,
        "disease":     disease,
        "result":      result_label,
        "confidence":  confidence_pct,
        "risk_level":  risk_level,
        "risk_flags":  risk_flags,
        "lime_scores": [{"feature": r["feature"], "score": r["score"]} for r in lime_results],
        "elapsed_ms":  elapsed_total_ms,
    })
