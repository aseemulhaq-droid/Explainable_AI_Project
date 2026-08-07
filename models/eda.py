"""

What this script checks for EACH dataset (this IS what "EDA" means):
1. Shape (rows x columns)
2. Missing values
3. Duplicate rows
4. Target class balance (how many disease vs no-disease cases)
5. Basic statistics (mean, min, max, std) per feature
6. Visual charts: target balance bar chart + correlation heatmap
---------------------------------------------------------
"""

import csv
import numpy as np
import matplotlib.pyplot as plt
import os

DATA_FOLDER = "../data"   # csv files are stored here
OUTPUT_FOLDER = "eda_charts"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

MISSING_MARKERS = ('', '?', 'NaN', 'nan', 'NA')

# Liver dataset has no header row in the raw Kaggle file
LIVER_COLUMNS = ['Age', 'Gender', 'Total_Bilirubin', 'Direct_Bilirubin',
                  'Alkaline_Phosphotase', 'Alamine_Aminotransferase',
                  'Aspartate_Aminotransferase', 'Total_Protiens',
                  'Albumin', 'Albumin_and_Globulin_Ratio', 'Dataset']


# ------------------------------------------------------------
# STEP 1: Load a CSV using only the built-in csv module
# ------------------------------------------------------------
def load_csv(filepath, has_header=True, manual_columns=None):
    """
    Reads a CSV file with no pandas.
    Returns: headers (list of column names), rows (list of lists, raw strings)
    """
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        reader = csv.reader(f)
        rows = [row for row in reader if row]  # skip blank lines

    if has_header:
        headers = rows[0]
        data_rows = rows[1:]
    else:
        headers = manual_columns
        data_rows = rows

    return headers, data_rows


# ------------------------------------------------------------
# STEP 2: Separate text columns from numeric columns
# ------------------------------------------------------------
def split_numeric_and_target(headers, rows, target_name, drop_columns=None):
    """
    Converts everything possible to float using NumPy.
    Returns:
        numeric_headers -> list of numeric column names (target excluded)
        X                -> NumPy array of numeric feature values (NaN for missing)
        y_raw            -> list of raw target values (kept as strings, since
                             target may be text like 'M'/'B')
    """
    drop_columns = drop_columns or []
    target_idx = headers.index(target_name)

    numeric_headers = []
    numeric_col_indices = []

    for i, col_name in enumerate(headers):
        if i == target_idx or col_name in drop_columns:
            continue
        # Check the first non-empty value in this column to guess if it's numeric
        sample_values = [row[i] for row in rows if row[i] not in MISSING_MARKERS][:5]
        is_numeric = all(_is_float(v) for v in sample_values) if sample_values else False
        if is_numeric:
            numeric_headers.append(col_name)
            numeric_col_indices.append(i)

    X = np.full((len(rows), len(numeric_col_indices)), np.nan)
    for r, row in enumerate(rows):
        for c, col_idx in enumerate(numeric_col_indices):
            val = row[col_idx]
            if val not in MISSING_MARKERS:
                X[r, c] = float(val)

    y_raw = [row[target_idx] for row in rows]
    return numeric_headers, X, y_raw


def _is_float(value):
    try:
        float(value)
        return True
    except ValueError:
        return False


# ------------------------------------------------------------
# STEP 3: Count missing values per column
# ------------------------------------------------------------
def count_missing(X, numeric_headers):
    missing_counts = np.isnan(X).sum(axis=0)
    result = {name: int(count) for name, count in zip(numeric_headers, missing_counts) if count > 0}
    return result


# ------------------------------------------------------------
# STEP 4: Count duplicate rows (using raw string rows)
# ------------------------------------------------------------
def count_duplicates(rows):
    seen = set()
    duplicates = 0
    for row in rows:
        row_tuple = tuple(row)
        if row_tuple in seen:
            duplicates += 1
        else:
            seen.add(row_tuple)
    return duplicates


# ------------------------------------------------------------
# STEP 5: Target class balance
# ------------------------------------------------------------
def target_balance(y_raw):
    unique_vals, counts = np.unique(y_raw, return_counts=True)
    return dict(zip(unique_vals, counts.tolist()))


# ------------------------------------------------------------
# STEP 6: Basic statistics using NumPy (ignoring NaN)
# ------------------------------------------------------------
def basic_stats(X, numeric_headers, max_cols=3):
    print(f"{'Feature':25s} {'mean':>10s} {'min':>10s} {'max':>10s} {'std':>10s}")
    for i, name in enumerate(numeric_headers[:max_cols]):
        col = X[:, i]
        print(f"{name:25s} {np.nanmean(col):10.2f} {np.nanmin(col):10.2f} "
              f"{np.nanmax(col):10.2f} {np.nanstd(col):10.2f}")


# ------------------------------------------------------------
# STEP 7: Correlation matrix using NumPy (mean-imputed for calc only)
# ------------------------------------------------------------
def correlation_matrix(X):
    X_filled = X.copy()
    col_means = np.nanmean(X_filled, axis=0)
    nan_r, nan_c = np.where(np.isnan(X_filled))
    X_filled[nan_r, nan_c] = np.take(col_means, nan_c)
    return np.corrcoef(X_filled, rowvar=False)


# ------------------------------------------------------------
# STEP 8: Charts (matplotlib - visualization only)
# ------------------------------------------------------------
def plot_eda(name, y_raw, numeric_headers, X):
    fig, axes = plt.subplots(1, 2, figsize=(12, 4.5))

    # Target balance bar chart
    balance = target_balance(y_raw)
    axes[0].bar(list(balance.keys()), list(balance.values()),
                color=['#00C2D4', '#EF4444', '#7C3AED'][:len(balance)])
    axes[0].set_title(f'{name.replace("_"," ")} - Target Balance')
    for i, (k, v) in enumerate(balance.items()):
        axes[0].text(i, v + 2, str(v), ha='center')

    # Correlation heatmap (first 12 numeric columns for readability)
    cols_to_use = numeric_headers[:12]
    corr = correlation_matrix(X[:, :12])
    im = axes[1].imshow(corr, cmap='coolwarm', vmin=-1, vmax=1)
    axes[1].set_xticks(range(len(cols_to_use)))
    axes[1].set_yticks(range(len(cols_to_use)))
    axes[1].set_xticklabels(cols_to_use, rotation=90, fontsize=7)
    axes[1].set_yticklabels(cols_to_use, fontsize=7)
    axes[1].set_title(f'{name.replace("_"," ")} - Correlation')
    fig.colorbar(im, ax=axes[1], shrink=0.7)

    plt.tight_layout()
    save_path = f"{OUTPUT_FOLDER}/{name}_eda.png"
    plt.savefig(save_path, dpi=130)
    plt.close()
    print(f"[8] Chart saved -> {save_path}")


# ------------------------------------------------------------
# MAIN: Run full EDA on one dataset
# ------------------------------------------------------------
def run_eda(name, filepath, target_name, has_header=True, manual_columns=None, drop_columns=None):
    print(f"\n{'='*65}")
    print(f" {name.replace('_',' ')}")
    print(f"{'='*65}")

    headers, rows = load_csv(filepath, has_header, manual_columns)
    print(f"[1] Shape: {len(rows)} rows, {len(headers)} columns")

    numeric_headers, X, y_raw = split_numeric_and_target(headers, rows, target_name, drop_columns)

    missing = count_missing(X, numeric_headers)
    print(f"[2] Missing values: {'NONE' if not missing else missing}")

    dup_count = count_duplicates(rows)
    print(f"[3] Duplicate rows: {dup_count}")

    balance = target_balance(y_raw)
    print(f"[4] Target ('{target_name}') class balance: {balance}")

    print(f"[5] Basic statistics (first 3 numeric features):")
    basic_stats(X, numeric_headers)

    plot_eda(name, y_raw, numeric_headers, X)


# ------------------------------------------------------------
# RUN ON ALL 4 DATASETS
# ------------------------------------------------------------
if __name__ == "__main__":

    run_eda("Diabetes", f"{DATA_FOLDER}/diabetes.csv", target_name="Outcome")

    run_eda("Heart_Disease", f"{DATA_FOLDER}/Heart_disease_cleveland_new.csv", target_name="target")

    run_eda("Breast_Cancer", f"{DATA_FOLDER}/brca.csv", target_name="y",
             drop_columns=[""])  # drops the unnamed index column

    run_eda("Liver_Disease", f"{DATA_FOLDER}/Indian Liver Patient Dataset (ILPD).csv", target_name="Dataset",
             has_header=False, manual_columns=LIVER_COLUMNS)

    print(f"\n\nAll EDA charts saved inside the '{OUTPUT_FOLDER}/' folder.")