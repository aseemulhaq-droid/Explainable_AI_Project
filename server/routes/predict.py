"""
server/routes/predict.py
---------------------------------------------------------
POST /predict
Authorization: Bearer <token>  (required)

Body:
{
    "disease":      "diabetes" | "heart" | "cancer" | "liver",
    "patient_name": "Jane Smith",
    "age":          45,
    "gender":       "female",
    "features": {
        "glucose": 150,
        "bmi": 27.5,
        ...
    }
}

Steps:
1. Validate session (401 if missing/invalid)
2. Validate disease key
3. Normalize raw feature values using SAVED col_min/col_max
4. Run FNN (already loaded in server.py)
5. Run risk_calculator on RAW (un-normalized) values
6. Persist: patient → diagnosis → feature_inputs
7. Return {"diagnosis_id", "result", "confidence", "risk_level"}
---------------------------------------------------------
"""
import sys
import os
import numpy as np

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.routes._helpers import read_json_body, send_json, send_error, require_auth
from server.database import queries
from models.risk_calculator import calculate_feature_flags, calculate_overall_risk
from server import models_store

_RISK_MAP = {"EMERGENCY": "RED", "MONITOR": "YELLOW", "SAFE": "GREEN"}


def _normalize(disease: str, raw_features: dict) -> tuple[np.ndarray, list[str]]:
    """
    Convert a raw {feature_name: value} dict to a normalised 1-D numpy array.
    Feature order follows the order in the normalization file.
    Returns (array_shape_n, feature_names_list).
    Raises KeyError if disease not in NORM_PARAMS.
    """
    norm = models_store.NORM_PARAMS[disease]
    feature_names = norm["feature_names"]
    col_min = norm["col_min"]
    col_max = norm["col_max"]
    denom = np.where((col_max - col_min) == 0, 1.0, col_max - col_min)

    raw = np.array(
        [float(raw_features.get(f, raw_features.get(f.replace("_", ""), 0.0)))
         for f in feature_names],
        dtype=float
    )
    normalised = np.clip((raw - col_min) / denom, 0.0, 1.0)
    return normalised, feature_names


def handle(handler):
    session = require_auth(handler)
    if session is None:
        return

    data = read_json_body(handler)
    if data is None:
        send_error(handler, 400, "Invalid or missing JSON body.")
        return

    # ── Validate inputs ──────────────────────────────────────────────────
    disease      = str(data.get("disease") or "").lower().strip()
    patient_name = str(data.get("patient_name") or "Unknown Patient").strip()
    age          = int(data.get("age") or 0)
    gender       = str(data.get("gender") or "unknown").lower().strip()
    raw_features = data.get("features") or {}

    valid_diseases = list(models_store.LOADED_MODELS.keys())
    if disease not in valid_diseases:
        send_error(handler, 400,
                   f"'disease' must be one of {valid_diseases}. Got: '{disease}'")
        return

    if not raw_features:
        send_error(handler, 400, "'features' dict is required and must not be empty.")
        return

    # ── Normalize ────────────────────────────────────────────────────────
    try:
        X_norm, feature_names = _normalize(disease, raw_features)
    except Exception as exc:
        send_error(handler, 500, f"Normalization error: {exc}")
        return

    # ── Inference ────────────────────────────────────────────────────────
    try:
        nn = models_store.LOADED_MODELS[disease]
        probs, binary = nn.predict(X_norm.reshape(1, -1))
        confidence_pct = round(float(probs[0, 0]) * 100, 2)
        result_label   = "DETECTED" if int(binary[0, 0]) == 1 else "NOT_DETECTED"
    except Exception as exc:
        send_error(handler, 500, f"Model inference failed: {exc}")
        return

    # ── Risk calculator ──────────────────────────────────────────────────
    try:
        risk_flags   = calculate_feature_flags(disease, raw_features)
        overall_risk = calculate_overall_risk(risk_flags, confidence_pct)
        risk_level   = _RISK_MAP.get(overall_risk, "YELLOW")
    except Exception:
        risk_flags = []
        risk_level = "YELLOW"

    # ── Persist to MySQL ─────────────────────────────────────────────────
    user_id = session["user_id"]
    try:
        patient_id = queries.create_patient(
            name=patient_name, age=age, gender=gender, created_by=user_id
        )
        diag_id = queries.save_diagnosis(
            patient_id=patient_id,
            disease_type=disease,
            result=result_label,
            confidence=confidence_pct,
            risk_level=risk_level,
            diagnosed_by=user_id,
        )
        queries.save_feature_inputs(diag_id, risk_flags)
    except Exception as exc:
        import traceback; traceback.print_exc()
        send_error(handler, 500, f"Database error while saving diagnosis: {exc}")
        return

    send_json(handler, 200, {
        "success":      True,
        "diagnosis_id": f"D{diag_id:05d}",
        "result":       result_label,
        "confidence":   confidence_pct,
        "risk_level":   risk_level,
    })
