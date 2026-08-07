"""
models/risk_calculator.py
---------------------------------------------------------
 Risk Calculator

Unlike the FNN and LIME, this is NOT machine learning - it's a
simple LOOKUP system. For each clinical feature, we compare the
patient's actual value against medically-established "normal"
reference ranges, and assign a flag:

    GREEN  = within normal range
    YELLOW = borderline / mildly abnormal
    RED    = clearly abnormal / high risk

Then we combine ALL the feature flags + the FNN's confidence score
into ONE overall risk level:

    SAFE       = mostly green, low disease confidence
    MONITOR    = some yellow flags, or moderate confidence
    EMERGENCY  = any red flag, or high disease confidence

IMPORTANT: these ranges are for a STUDENT PROJECT / decision-support
demo only, based on commonly cited clinical reference values.
They are NOT a substitute for real medical guidelines, and would
need proper clinical validation before any real-world use.
---------------------------------------------------------
"""

# ======================================================================
# CLINICAL NORMAL RANGES PER DISEASE
# Format: feature_name -> (green_low, green_high, yellow_low, yellow_high)
# Outside the yellow range entirely = RED
# ======================================================================

NORMAL_RANGES = {

    "diabetes": {
        # Fasting glucose, mg/dL
        "glucose":        (70, 99, 100, 125),
        # Body Mass Index, kg/m^2
        "bmi":             (18.5, 24.9, 25, 29.9),
        # Diastolic blood pressure, mmHg
        "blood_pressure":  (60, 79, 80, 89),
        # Fasting insulin, mu U/mL
        "insulin":         (16, 166, 167, 250),
        # These 3 don't have a strict "normal/abnormal" clinical range -
        # they're demographic/history values, not lab results - so we
        # don't flag them Red/Yellow/Green, just display as-is
        # (pregnancies, age, skin_thickness, dpf are informational only)
    },

    "heart": {
        # Resting blood pressure, mmHg (systolic)
        "resting_bp":      (90, 119, 120, 139),
        # Total cholesterol, mg/dL
        "cholesterol":     (0, 199, 200, 239),
        # Max heart rate achieved - normal range depends on age, using
        # a simplified general adult reference here
        "max_heart_rate":  (100, 170, 60, 99),
        # Fasting blood sugar > 120 mg/dL is the standard heart-dataset flag
        # (this feature is already binary 0/1 in the dataset: 1 = > 120 mg/dL)
    },

    "liver": {
        # mg/dL
        "total_bilirubin":     (0.1, 1.2, 1.3, 3.0),
        "direct_bilirubin":    (0.0, 0.3, 0.4, 1.0),
        # U/L
        "alkaline_phosphatase": (44, 147, 148, 300),
        "alt":                  (7, 56, 57, 150),   # Alanine Aminotransferase
        "ast":                  (10, 40, 41, 150),  # Aspartate Aminotransferase
        # g/dL
        "total_proteins":       (6.0, 8.3, 5.0, 5.9),
        "albumin":              (3.5, 5.0, 3.0, 3.4),
        "albumin_globulin_ratio": (1.0, 2.5, 0.7, 0.9),
    },

    # Breast Cancer features are derived from digitised cell nuclei
    # images (radius, texture, smoothness, etc.) - there is no
    # established "clinical normal range" for these the way there is
    # for blood tests. For this disease, the Risk Calculator instead
    # relies on the FNN confidence + LIME importance, not per-feature
    # flags. This is documented as a known limitation of the Risk
    # Calculator for this specific disease.
    "cancer": {}
}


def get_risk_flag(disease, feature_name, value):
    """
    Compares ONE patient value against the clinical range table.
    Returns: "GREEN", "YELLOW", "RED", or "N/A" (if this feature
    has no defined clinical range, e.g. Age, Pregnancies).
    """
    disease = disease.lower()
    feature_name = feature_name.lower()

    ranges = NORMAL_RANGES.get(disease, {})
    if feature_name not in ranges:
        return "N/A"

    green_low, green_high, yellow_low, yellow_high = ranges[feature_name]

    if green_low <= value <= green_high:
        return "GREEN"

    # Yellow range might be defined as either above OR below green
    # (e.g. max_heart_rate: yellow could be a lower band)
    yellow_min, yellow_max = min(yellow_low, yellow_high), max(yellow_low, yellow_high)
    if yellow_min <= value <= yellow_max:
        return "YELLOW"

    return "RED"


def calculate_feature_flags(disease, features_dict):
    """
    Runs get_risk_flag() across an entire patient's feature set.

    features_dict -> {"glucose": 280, "bmi": 32, ...} (raw, NOT normalised values)

    Returns: list of dicts, e.g.
        [{"feature": "glucose", "value": 280, "status": "RED"}, ...]
    matching the Risk Heatmap format from the API spec (Section 5.5)
    """
    results = []
    for feature_name, value in features_dict.items():
        flag = get_risk_flag(disease, feature_name, value)
        results.append({
            "feature": feature_name,
            "value": value,
            "status": flag
        })
    return results


def calculate_overall_risk(feature_flags, confidence):
    """
    Combines all feature flags + the FNN's prediction confidence into
    ONE overall risk level for the doctor to see at a glance.

    feature_flags -> output from calculate_feature_flags()
    confidence     -> FNN's predicted probability of disease, 0-100

    Logic (simple, explainable rule-based combination):
        - Any RED feature flag           -> EMERGENCY
        - High confidence (>= 70%)       -> EMERGENCY
        - Any YELLOW flag OR mid confidence (40-70%) -> MONITOR
        - Otherwise (all green, low confidence)      -> SAFE
    """
    red_count = sum(1 for f in feature_flags if f["status"] == "RED")
    yellow_count = sum(1 for f in feature_flags if f["status"] == "YELLOW")

    if red_count > 0 or confidence >= 70:
        return "EMERGENCY"
    elif yellow_count > 0 or confidence >= 40:
        return "MONITOR"
    else:
        return "SAFE"


# ======================================================================
# QUICK TEST - run this file directly to check it works correctly
# ======================================================================
if __name__ == "__main__":
    print("Testing Risk Calculator with sample patients...\n")

    # ---- Test 1: A clearly high-risk diabetes patient ----
    print("=" * 60)
    print("Test 1: Diabetes patient - high glucose, high BMI")
    print("=" * 60)
    patient_1 = {
        "glucose": 280,
        "bmi": 34,
        "blood_pressure": 95,
        "insulin": 300,
        "age": 54,          # not flagged - informational only
        "pregnancies": 6,   # not flagged
    }
    flags = calculate_feature_flags("diabetes", patient_1)
    for f in flags:
        print(f"  {f['feature']:18s} value={f['value']:<8} status={f['status']}")

    overall = calculate_overall_risk(flags, confidence=91.4)
    print(f"\n  Overall Risk Level (confidence=91.4%): {overall}")
    assert overall == "EMERGENCY", "Expected EMERGENCY for high glucose + high confidence"
    print("  PASSED: correctly flagged as EMERGENCY")

    # ---- Test 2: A healthy diabetes patient ----
    print("\n" + "=" * 60)
    print("Test 2: Diabetes patient - all normal values")
    print("=" * 60)
    patient_2 = {
        "glucose": 88,
        "bmi": 22,
        "blood_pressure": 72,
        "insulin": 90,
    }
    flags = calculate_feature_flags("diabetes", patient_2)
    for f in flags:
        print(f"  {f['feature']:18s} value={f['value']:<8} status={f['status']}")

    overall = calculate_overall_risk(flags, confidence=8.2)
    print(f"\n  Overall Risk Level (confidence=8.2%): {overall}")
    assert overall == "SAFE", "Expected SAFE for all-normal values + low confidence"
    print("  PASSED: correctly flagged as SAFE")

    # ---- Test 3: A borderline liver patient ----
    print("\n" + "=" * 60)
    print("Test 3: Liver patient - borderline bilirubin")
    print("=" * 60)
    patient_3 = {
        "total_bilirubin": 1.8,
        "direct_bilirubin": 0.5,
        "albumin": 3.6,
    }
    flags = calculate_feature_flags("liver", patient_3)
    for f in flags:
        print(f"  {f['feature']:18s} value={f['value']:<8} status={f['status']}")

    overall = calculate_overall_risk(flags, confidence=45.0)
    print(f"\n  Overall Risk Level (confidence=45.0%): {overall}")
    assert overall == "MONITOR", "Expected MONITOR for yellow flags + mid confidence"
    print("  PASSED: correctly flagged as MONITOR")

    print("\nAll tests passed. Risk Calculator is working correctly.")