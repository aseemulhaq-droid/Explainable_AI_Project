"""
models/preprocess.py
---------------------------------------------------------
Inference-time feature preprocessing.

At training time (train.py), each dataset was min-max normalised
using column min/max computed from the training split.  We must
apply the *same* scaling at inference time so the network receives
numbers in the same 0-1 range it was trained on.

Rather than re-reading the CSVs on every request we hard-code the
per-disease feature names and approximate training-range values
derived from the four public datasets.  These values are close
enough for demo / student-project purposes.

CRITICAL: Do NOT import or modify neural_network.py, train.py,
          lime_explainer.py, or risk_calculator.py from this file.
---------------------------------------------------------
"""

import numpy as np

# ---------------------------------------------------------------------------
# Per-disease feature configuration
#   "features"  : ordered list of feature names (must match CSV column order
#                 used during training and what the frontend sends)
#   "col_min"   : column minimum from training data (used for min-max scaling)
#   "col_max"   : column maximum from training data
# ---------------------------------------------------------------------------
DISEASE_CONFIG = {
    "diabetes": {
        "features": [
            "pregnancies", "glucose", "blood_pressure", "skin_thickness",
            "insulin", "bmi", "dpf", "age"
        ],
        # Approximate min/max from Pima Indians Diabetes dataset training split
        "col_min": np.array([0,    0,    0,  0,   0,    0,    0.078, 21], dtype=float),
        "col_max": np.array([17, 199,  122, 99, 846,  67.1,  2.42,  81], dtype=float),
    },
    "heart": {
        "features": [
            "age", "sex", "cp", "resting_bp", "cholesterol", "fbs",
            "restecg", "max_heart_rate", "exang", "oldpeak", "slope", "ca", "thal"
        ],
        # Approximate min/max from Cleveland Heart Disease dataset
        "col_min": np.array([29, 0, 0,  94,  126, 0, 0,  71, 0, 0,   0, 0, 0], dtype=float),
        "col_max": np.array([77, 1, 3, 200,  564, 1, 2, 202, 1, 6.2, 2, 4, 3], dtype=float),
    },
    "cancer": {
        "features": [
            "radius_mean", "texture_mean", "perimeter_mean", "area_mean",
            "smoothness_mean", "compactness_mean", "concavity_mean",
            "concave_pts_mean", "symmetry_mean", "fractal_dim_mean",
            "radius_se", "texture_se", "perimeter_se", "area_se",
            "smoothness_se", "compactness_se", "concavity_se",
            "concave_pts_se", "symmetry_se", "fractal_dim_se",
            "radius_worst", "texture_worst", "perimeter_worst", "area_worst",
            "smoothness_worst", "compactness_worst", "concavity_worst",
            "concave_pts_worst", "symmetry_worst", "fractal_dim_worst"
        ],
        # Approximate min/max from BRCA dataset
        "col_min": np.array([
            6.98, 9.71, 43.79, 143.5, 0.053, 0.019, 0.0, 0.0, 0.106, 0.05,
            0.112, 0.36, 0.757, 6.8, 0.002, 0.002, 0.0, 0.0, 0.008, 0.001,
            7.93, 12.02, 50.41, 185.2, 0.071, 0.027, 0.0, 0.0, 0.157, 0.055
        ], dtype=float),
        "col_max": np.array([
            28.11, 39.28, 188.5, 2501.0, 0.163, 0.345, 0.427, 0.201, 0.304, 0.097,
            2.873, 4.885, 21.98, 542.2, 0.031, 0.135, 0.396, 0.053, 0.079, 0.030,
            36.04, 49.54, 251.2, 4254.0, 0.222, 1.058, 1.252, 0.291, 0.664, 0.208
        ], dtype=float),
    },
    "liver": {
        "features": [
            "age", "gender", "total_bilirubin", "direct_bilirubin",
            "alkaline_phosphatase", "alt", "ast",
            "total_proteins", "albumin", "albumin_globulin_ratio"
        ],
        # Approximate min/max from ILPD dataset
        "col_min": np.array([4,  0, 0.4,  0.1,  63,  10,  10, 2.7,  0.9, 0.3], dtype=float),
        "col_max": np.array([90, 1, 75.0, 19.7, 2110, 2000, 4929, 9.6, 5.5, 2.8], dtype=float),
    },
}


def get_feature_names(disease: str):
    """Return the ordered list of feature names for a given disease."""
    disease = disease.lower()
    if disease not in DISEASE_CONFIG:
        raise ValueError(f"Unknown disease '{disease}'. Valid: {list(DISEASE_CONFIG.keys())}")
    return DISEASE_CONFIG[disease]["features"]


def normalise(disease: str, raw_features: dict) -> np.ndarray:
    """
    Convert a raw {feature_name: value} dict into a normalised numpy
    array (shape (1, num_features)) ready to feed into the FNN.

    Uses the same min-max formula as train.py:
        x_norm = (x - col_min) / (col_max - col_min)

    Missing features default to 0.0 before normalisation.
    """
    disease = disease.lower()
    if disease not in DISEASE_CONFIG:
        raise ValueError(f"Unknown disease '{disease}'. Valid: {list(DISEASE_CONFIG.keys())}")

    cfg = DISEASE_CONFIG[disease]
    feature_names = cfg["features"]
    col_min = cfg["col_min"]
    col_max = cfg["col_max"]

    # Build raw value array in the correct column order
    raw_array = np.array(
        [float(raw_features.get(f, 0.0)) for f in feature_names],
        dtype=float
    )

    # Min-max normalise (avoid div-by-zero for constant columns)
    denom = np.where((col_max - col_min) == 0, 1.0, col_max - col_min)
    normalised = (raw_array - col_min) / denom

    # Clip to [0, 1] to handle out-of-range inputs gracefully
    normalised = np.clip(normalised, 0.0, 1.0)

    return normalised.reshape(1, -1)
