"""
server/models_store.py
---------------------------------------------------------
Shared store for loaded models and normalization parameters.
Loaded once at server startup (in server.py).
---------------------------------------------------------
"""
import os
import sys
import numpy as np
from models.neural_network import FeedforwardNeuralNetwork

_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
_MODELS_SAVED = os.path.join(_ROOT, "models", "saved")

_DISEASE_FILES = {
    "diabetes":     ("diabetes_weights.npy",        "diabetes_normalization.npy"),
    "heart":        ("heart_disease_weights.npy",    "heart_disease_normalization.npy"),
    "cancer":       ("breast_cancer_weights.npy",    "breast_cancer_normalization.npy"),
    "liver":        ("liver_disease_weights.npy",    "liver_disease_normalization.npy"),
}

LOADED_MODELS: dict[str, FeedforwardNeuralNetwork] = {}
NORM_PARAMS: dict[str, dict] = {}


def load_all_models():
    """Load all 4 models and normalization parameters into shared dicts."""
    print("\n[startup] Loading trained models and normalization parameters...", flush=True)
    all_ok = True

    for disease, (weights_file, norm_file) in _DISEASE_FILES.items():
        weights_path = os.path.join(_MODELS_SAVED, weights_file)
        norm_path    = os.path.join(_MODELS_SAVED, norm_file)

        if not os.path.exists(norm_path):
            print(f"  [FAIL] {disease}: normalization file not found: {norm_path}", flush=True)
            all_ok = False
            continue
        try:
            norm_data = np.load(norm_path, allow_pickle=True).item()
            NORM_PARAMS[disease] = norm_data
        except Exception as exc:
            print(f"  [FAIL] {disease}: could not load normalization: {exc}", flush=True)
            all_ok = False
            continue

        if not os.path.exists(weights_path):
            print(f"  [FAIL] {disease}: weights file not found: {weights_path}", flush=True)
            all_ok = False
            continue
        try:
            n_features = len(norm_data["feature_names"])
            nn = FeedforwardNeuralNetwork(input_size=n_features)
            nn.load_weights(weights_path)
            LOADED_MODELS[disease] = nn
            print(f"  [ OK ] {disease}: {n_features} features loaded  ({weights_file})", flush=True)
        except Exception as exc:
            print(f"  [FAIL] {disease}: could not load model weights: {exc}", flush=True)
            all_ok = False

    if not all_ok:
        print("\n[startup] One or more models failed to load. Server will NOT start.", flush=True)
        sys.exit(1)

    print(f"[startup] All {len(LOADED_MODELS)} models loaded successfully.\n", flush=True)
