"""
server/routes/stats.py
---------------------------------------------------------
GET /stats
Authorization: Bearer <token>  (any authenticated role)

Returns aggregate stats for researcher/doctor dashboards:
- active_models: number of loaded AI models
- avg_accuracy: average confidence across all diagnoses
- datasets: list of dataset names
- dataset_count: number of datasets
- total_predictions: total diagnoses
- detected_count: total detected cases
- disease_distribution: {disease: count}
---------------------------------------------------------
"""
import sys
import os

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from server.routes._helpers import send_json, send_error, require_auth
from server.database import queries
from server import models_store


def handle(handler):
    session = require_auth(handler)
    if session is None:
        return

    # Get all records to compute aggregate stats (no role filter = all records)
    try:
        all_records = queries.get_history()
    except Exception:
        all_records = []

    total = len(all_records)
    detected = sum(1 for r in all_records if str(r.get("result", "")).upper() == "DETECTED")
    conf_vals = [float(r["confidence"]) for r in all_records if r.get("confidence") is not None]
    avg_acc = round(sum(conf_vals) / len(conf_vals), 2) if conf_vals else 0.0

    # Disease distribution
    disease_dist = {}
    for r in all_records:
        d = str(r.get("disease", "unknown")).lower()
        disease_dist[d] = disease_dist.get(d, 0) + 1

    loaded_models = list(models_store.LOADED_MODELS.keys())
    datasets = ["Pima Indians Diabetes", "Cleveland Heart Disease", "Wisconsin Breast Cancer", "ILPD Liver Disease"]

    send_json(handler, 200, {
        "success": True,
        "active_models": len(loaded_models),
        "models": loaded_models,
        "avg_accuracy": avg_acc,
        "datasets": datasets,
        "dataset_count": len(datasets),
        "total_predictions": total,
        "detected_count": detected,
        "detection_rate": round((detected / total * 100), 2) if total else 0.0,
        "disease_distribution": disease_dist,
    })
