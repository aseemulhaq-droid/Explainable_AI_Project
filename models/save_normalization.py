"""
models/save_normalization.py
---------------------------------------------------------
Companion script to train.py.

train.py does NOT save the min/max normalization values it computes
during prepare_dataset().  Without these, inference-time normalization
would use hard-coded approximations instead of the exact values from
training.

This script re-runs prepare_dataset() for each disease with the same
arguments as train.py, captures col_min / col_max, and saves them
alongside the weight files:

  models/saved/diabetes_normalization.npy
  models/saved/heart_disease_normalization.npy
  models/saved/breast_cancer_normalization.npy
  models/saved/liver_disease_normalization.npy

Each .npy file stores a dict:
  {
    "col_min":      np.ndarray,   # shape (n_features,)
    "col_max":      np.ndarray,   # shape (n_features,)
    "feature_names": list[str],   # ordered list matching col indices
  }

Run from the models/ directory:
    python save_normalization.py

IMPORTANT: run this AFTER train.py has produced the weight files, so
server.py can load both at startup.
---------------------------------------------------------
"""

import csv
import os
import sys

import numpy as np

# ── Add project root to path so this works from both models/ and root ────
_THIS = os.path.abspath(__file__)
_MODELS_DIR = os.path.dirname(_THIS)
_PROJECT_ROOT = os.path.dirname(_MODELS_DIR)
for p in (_PROJECT_ROOT, _MODELS_DIR):
    if p not in sys.path:
        sys.path.insert(0, p)

# ── Reuse train.py's helper functions (no re-import of the whole module) ─
DATA_FOLDER = os.path.join(_MODELS_DIR, "..", "data")
SAVE_FOLDER = os.path.join(_MODELS_DIR, "saved")
os.makedirs(SAVE_FOLDER, exist_ok=True)

MISSING_MARKERS = ("", "?", "NaN", "nan", "NA")

LIVER_COLUMNS = [
    "Age", "Gender", "Total_Bilirubin", "Direct_Bilirubin",
    "Alkaline_Phosphotase", "Alamine_Aminotransferase",
    "Aspartate_Aminotransferase", "Total_Protiens",
    "Albumin", "Albumin_and_Globulin_Ratio", "Dataset",
]


def load_csv(filepath, has_header=True, manual_columns=None):
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        rows = [row for row in reader if row]
    if has_header:
        return rows[0], rows[1:]
    return manual_columns, rows


def _is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False


def compute_normalization(filepath, target_name, has_header=True,
                          manual_columns=None, drop_columns=None,
                          categorical_map=None):
    """
    Mirror of train.py prepare_dataset() but returns col_min, col_max,
    and the ordered feature names instead of the split dataset.
    """
    drop_columns = drop_columns or []
    categorical_map = categorical_map or {}

    headers, rows = load_csv(filepath, has_header, manual_columns)
    target_idx = headers.index(target_name)

    for col_name, mapping in categorical_map.items():
        col_idx = headers.index(col_name)
        for row in rows:
            if row[col_idx] in mapping:
                row[col_idx] = mapping[row[col_idx]]

    numeric_indices = []
    feature_names = []
    for i, col_name in enumerate(headers):
        if i == target_idx or col_name in drop_columns:
            continue
        numeric_indices.append(i)
        feature_names.append(col_name.lower())

    X = np.full((len(rows), len(numeric_indices)), np.nan)
    for r, row in enumerate(rows):
        for c, col_idx in enumerate(numeric_indices):
            val = row[col_idx]
            if val not in MISSING_MARKERS and _is_float(val):
                X[r, c] = float(val)

    col_means = np.nanmean(X, axis=0)
    nan_r, nan_c = np.where(np.isnan(X))
    X[nan_r, nan_c] = np.take(col_means, nan_c)

    col_min = X.min(axis=0)
    col_max = X.max(axis=0)

    return col_min, col_max, feature_names


def save_norm(disease_name, col_min, col_max, feature_names):
    path = os.path.join(SAVE_FOLDER, f"{disease_name.lower()}_normalization.npy")
    np.save(path, {
        "col_min":       col_min,
        "col_max":       col_max,
        "feature_names": feature_names,
    })
    print(f"  Saved  {path}")
    print(f"  Features ({len(feature_names)}): {feature_names}")
    print(f"  col_min: {col_min.round(4).tolist()}")
    print(f"  col_max: {col_max.round(4).tolist()}\n")


if __name__ == "__main__":
    print("=" * 60)
    print("  Saving normalization parameters for all 4 diseases")
    print("=" * 60)

    # ── Diabetes ──────────────────────────────────────────────────
    print("\n[1/4] Diabetes")
    col_min, col_max, feat = compute_normalization(
        os.path.join(DATA_FOLDER, "diabetes.csv"),
        target_name="Outcome",
    )
    save_norm("diabetes", col_min, col_max, feat)

    # ── Heart Disease ─────────────────────────────────────────────
    print("[2/4] Heart Disease")
    col_min, col_max, feat = compute_normalization(
        os.path.join(DATA_FOLDER, "Heart_disease_cleveland_new.csv"),
        target_name="target",
    )
    save_norm("heart_disease", col_min, col_max, feat)

    # ── Breast Cancer ─────────────────────────────────────────────
    print("[3/4] Breast Cancer")
    col_min, col_max, feat = compute_normalization(
        os.path.join(DATA_FOLDER, "brca.csv"),
        target_name="y",
        drop_columns=[""],
    )
    save_norm("breast_cancer", col_min, col_max, feat)

    # ── Liver Disease ─────────────────────────────────────────────
    print("[4/4] Liver Disease")
    col_min, col_max, feat = compute_normalization(
        os.path.join(DATA_FOLDER, "Indian Liver Patient Dataset (ILPD).csv"),
        target_name="Dataset",
        has_header=False,
        manual_columns=LIVER_COLUMNS,
        categorical_map={"Gender": {"Male": 1, "Female": 0}},
    )
    save_norm("liver_disease", col_min, col_max, feat)

    print("=" * 60)
    print("  All normalization files saved to models/saved/")
    print("=" * 60)
