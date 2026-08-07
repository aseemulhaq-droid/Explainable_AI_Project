"""
models/train.py
---------------------------------------------------------
 Train All Four Models


---------------------------------------------------------
"""

import csv
import numpy as np
import os
from neural_network import FeedforwardNeuralNetwork

DATA_FOLDER = "../data"
SAVE_FOLDER = "saved"
os.makedirs(SAVE_FOLDER, exist_ok=True)

MISSING_MARKERS = ('', '?', 'NaN', 'nan', 'NA')

LIVER_COLUMNS = ['Age', 'Gender', 'Total_Bilirubin', 'Direct_Bilirubin',
                  'Alkaline_Phosphotase', 'Alamine_Aminotransferase',
                  'Aspartate_Aminotransferase', 'Total_Protiens',
                  'Albumin', 'Albumin_and_Globulin_Ratio', 'Dataset']


# ======================================================================
# PREPROCESSING (pure Python + NumPy - same approach as Step 4)
# ======================================================================
def load_csv(filepath, has_header=True, manual_columns=None):
    with open(filepath, 'r', encoding='utf-8-sig') as f:
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


def prepare_dataset(filepath, target_name, has_header=True, manual_columns=None,
                     drop_columns=None, categorical_map=None, target_map=None):
    """
    Full pipeline: load -> encode categoricals -> mean imputation ->
    min-max normalise -> 80/20 split.

    categorical_map -> {column_name: {'text_value': number}} for feature columns
    target_map       -> {'raw_target_value': 0_or_1} to standardise the label
    """
    drop_columns = drop_columns or []
    categorical_map = categorical_map or {}
    headers, rows = load_csv(filepath, has_header, manual_columns)

    target_idx = headers.index(target_name)

    # Encode categorical FEATURE columns (e.g. Gender: Male/Female -> 1/0)
    for col_name, mapping in categorical_map.items():
        col_idx = headers.index(col_name)
        for row in rows:
            if row[col_idx] in mapping:
                row[col_idx] = mapping[row[col_idx]]

    # Figure out which columns are usable numeric features
    numeric_indices = []
    for i, col_name in enumerate(headers):
        if i == target_idx or col_name in drop_columns:
            continue
        numeric_indices.append(i)

    X = np.full((len(rows), len(numeric_indices)), np.nan)
    for r, row in enumerate(rows):
        for c, col_idx in enumerate(numeric_indices):
            val = row[col_idx]
            if val not in MISSING_MARKERS and _is_float(val):
                X[r, c] = float(val)

    # Target column (with optional remapping, e.g. liver: 1/2 -> 1/0)
    y_raw = [row[target_idx] for row in rows]
    if target_map:
        y = np.array([target_map[v] for v in y_raw], dtype=float)
    else:
        y = np.array([float(v) for v in y_raw], dtype=float)

    # Mean imputation (fill NaN with column mean)
    col_means = np.nanmean(X, axis=0)
    nan_r, nan_c = np.where(np.isnan(X))
    X[nan_r, nan_c] = np.take(col_means, nan_c)

    # Min-Max normalisation (scale every feature to 0-1)
    col_min = X.min(axis=0)
    col_max = X.max(axis=0)
    denom = np.where((col_max - col_min) == 0, 1, col_max - col_min)
    X_norm = (X - col_min) / denom

    # 80/20 train-test split (shuffled, reproducible)
    np.random.seed(42)
    n = X_norm.shape[0]
    idx = np.random.permutation(n)
    split = int(n * 0.8)
    train_idx, test_idx = idx[split:], idx[:split]  # note: test = first 20% after shuffle
    train_idx, test_idx = idx[:int(n*0.8)], idx[int(n*0.8):]

    return X_norm[train_idx], X_norm[test_idx], y[train_idx], y[test_idx]


# ======================================================================
# EVALUATION METRICS (pure NumPy - no sklearn.metrics)
# ======================================================================
def evaluate(y_true, y_pred):
    y_true = y_true.flatten()
    y_pred = y_pred.flatten()

    tp = np.sum((y_pred == 1) & (y_true == 1))
    tn = np.sum((y_pred == 0) & (y_true == 0))
    fp = np.sum((y_pred == 1) & (y_true == 0))
    fn = np.sum((y_pred == 0) & (y_true == 1))

    accuracy = (tp + tn) / len(y_true)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return {
        "accuracy": accuracy, "precision": precision,
        "recall": recall, "f1": f1,
        "confusion_matrix": {"TP": int(tp), "TN": int(tn), "FP": int(fp), "FN": int(fn)}
    }


# ======================================================================
# TRAIN ONE DISEASE MODEL
# ======================================================================
def train_disease_model(disease_name, X_train, X_test, y_train, y_test,
                         target_accuracy, epochs=600, batch_size=32, learning_rate=0.1):
    print(f"\n{'='*65}")
    print(f" Training: {disease_name}  (target accuracy: {target_accuracy*100:.0f}%+)")
    print(f"{'='*65}")
    print(f"Train samples: {X_train.shape[0]}, Test samples: {X_test.shape[0]}, Features: {X_train.shape[1]}")

    nn = FeedforwardNeuralNetwork(input_size=X_train.shape[1])
    history = nn.train(X_train, y_train, epochs=epochs, batch_size=batch_size,
                        learning_rate=learning_rate, verbose=True)

    _, train_preds = nn.predict(X_train)
    _, test_preds = nn.predict(X_test)

    train_metrics = evaluate(y_train, train_preds)
    test_metrics = evaluate(y_test, test_preds)

    print(f"\n  Final Training Loss : {history[-1]:.4f}")
    print(f"  Train Accuracy      : {train_metrics['accuracy']*100:.2f}%")
    print(f"  Test Accuracy       : {test_metrics['accuracy']*100:.2f}%")
    print(f"  Test Precision      : {test_metrics['precision']*100:.2f}%")
    print(f"  Test Recall         : {test_metrics['recall']*100:.2f}%")
    print(f"  Test F1-Score       : {test_metrics['f1']*100:.2f}%")
    print(f"  Confusion Matrix    : {test_metrics['confusion_matrix']}")

    status = "MEETS TARGET" if test_metrics['accuracy'] >= target_accuracy else "BELOW TARGET"
    print(f"  >>> {status} <<<")

    save_path = f"{SAVE_FOLDER}/{disease_name.lower()}_weights.npy"
    nn.save_weights(save_path)

    return nn, test_metrics


# ======================================================================
# RUN FOR ALL 4 DISEASES
# ======================================================================
if __name__ == "__main__":

    results = {}

    # ---- DIABETES ----
    X_tr, X_te, y_tr, y_te = prepare_dataset(
        f"{DATA_FOLDER}/diabetes.csv", target_name="Outcome"
    )
    _, results["Diabetes"] = train_disease_model("Diabetes", X_tr, X_te, y_tr, y_te, target_accuracy=0.88)

    # ---- HEART DISEASE ----
    X_tr, X_te, y_tr, y_te = prepare_dataset(
        f"{DATA_FOLDER}/Heart_disease_cleveland_new.csv", target_name="target"
    )
    _, results["Heart_Disease"] = train_disease_model("Heart_Disease", X_tr, X_te, y_tr, y_te, target_accuracy=0.85)

    # ---- BREAST CANCER ----
    X_tr, X_te, y_tr, y_te = prepare_dataset(
        f"{DATA_FOLDER}/brca.csv", target_name="y",
        drop_columns=[""],
        target_map={"M": 1, "B": 0}
    )
    _, results["Breast_Cancer"] = train_disease_model("Breast_Cancer", X_tr, X_te, y_tr, y_te, target_accuracy=0.93)

    # ---- LIVER DISEASE ----
    X_tr, X_te, y_tr, y_te = prepare_dataset(
        f"{DATA_FOLDER}/Indian Liver Patient Dataset (ILPD).csv", target_name="Dataset",
        has_header=False, manual_columns=LIVER_COLUMNS,
        categorical_map={"Gender": {"Male": 1, "Female": 0}},
        target_map={"1": 1, "2": 0}   # 1 = disease present, 2 = no disease -> mapped to 1/0
    )
    _, results["Liver_Disease"] = train_disease_model("Liver_Disease", X_tr, X_te, y_tr, y_te, target_accuracy=0.86)

    # ---- FINAL SUMMARY ----
    print(f"\n\n{'='*65}")
    print(" FINAL SUMMARY - ALL 4 MODELS")
    print(f"{'='*65}")
    for disease, metrics in results.items():
        print(f"{disease:20s} Accuracy: {metrics['accuracy']*100:6.2f}%   "
              f"Precision: {metrics['precision']*100:6.2f}%   "
              f"Recall: {metrics['recall']*100:6.2f}%   "
              f"F1: {metrics['f1']*100:6.2f}%")

    print(f"\nAll trained weights saved inside '{SAVE_FOLDER}/'")