"""
models/lime_explainer.py
---------------------------------------------------------
 Custom LIME Explainability Engine (Built From Scratch)

LIME = Local Interpretable Model-agnostic Explanations

---------------------------------------------------------
"""

import numpy as np
import time


def generate_perturbations(patient_features, num_samples=1000, noise_scale=0.1, seed=None):
    """
    STEP 1: Create 1,000 slightly-modified copies of one patient's data.

    patient_features -> NumPy array, shape (num_features,) - ONE patient,
                         already normalised (0-1 range, same as training)
    noise_scale       -> how much to "wiggle" each feature (proportional
                         Gaussian noise - bigger feature values get
                         proportionally bigger wiggles)

    Returns: perturbed_data, shape (num_samples, num_features)
    """
    if seed is not None:
        np.random.seed(seed)

    num_features = patient_features.shape[0]

    # Proportional Gaussian noise: each feature's noise is scaled to
    # its own value, so a feature near 0 gets small wiggles and a
    # feature near 1 gets bigger wiggles - keeps perturbations realistic
    noise = np.random.normal(loc=0, scale=noise_scale, size=(num_samples, num_features))
    perturbed = patient_features + (noise * (patient_features + 0.01))  # +0.01 avoids zero-noise when feature=0

    # Keep values inside valid 0-1 range (since features were min-max normalised)
    perturbed = np.clip(perturbed, 0, 1)

    return perturbed


def run_perturbations_through_model(model, perturbed_data):
    """
    STEP 2: Feed all 1,000 perturbed patients through the trained FNN.

    model          -> a trained FeedforwardNeuralNetwork instance
    perturbed_data -> shape (1000, num_features)

    Returns: predictions, shape (1000,) - probability of disease for
             each of the 1000 slightly-different fake patients
    """
    probabilities, _ = model.predict(perturbed_data)
    return probabilities.flatten()


def calculate_feature_importance(perturbed_data, predictions):
    """
    STEP 3 + 4: For each feature, calculate how strongly its variation
    correlates with the prediction changing - then convert that into
    a 0-100% importance score.

    Uses Pearson correlation: measures how much two variables move
    together. If Glucose going up strongly correlates with the disease
    probability going up, Glucose gets a high importance score.
    """
    num_features = perturbed_data.shape[1]
    correlations = np.zeros(num_features)

    for i in range(num_features):
        feature_column = perturbed_data[:, i]

        # If a feature has zero variance (all 1000 perturbations are
        # identical), correlation is undefined - treat as 0 importance
        if np.std(feature_column) == 0 or np.std(predictions) == 0:
            correlations[i] = 0.0
        else:
            # np.corrcoef returns a 2x2 matrix; [0,1] is the correlation
            # between the two variables we care about
            correlations[i] = np.corrcoef(feature_column, predictions)[0, 1]

    # Use ABSOLUTE correlation - we care about STRENGTH of influence,
    # not direction (a feature can matter a lot even if it pushes the
    # prediction down, not just up)
    abs_correlations = np.abs(correlations)

    # STEP 4: Normalise into percentage importance (0-100%), so all
    # feature scores are relative to each other and easy to read
    total = np.sum(abs_correlations)
    if total == 0:
        importance_pct = np.zeros(num_features)
    else:
        importance_pct = (abs_correlations / total) * 100

    return importance_pct, correlations  # correlations kept for direction (+/-) if needed


def explain_prediction(model, patient_features, feature_names, num_samples=1000,
                        noise_scale=0.1, seed=None):
    """
    MAIN FUNCTION - runs the full 5-step LIME process for one patient.

    patient_features -> NumPy array, shape (num_features,), already
                         normalised the same way training data was
    feature_names     -> list of strings, e.g. ['glucose','bmi','age',...]

    Returns: list of dicts, sorted by importance (highest first):
        [{"feature": "glucose", "score": 78.2, "direction": "increases risk"}, ...]
    """
    start_time = time.time()

    # STEP 1
    perturbed = generate_perturbations(patient_features, num_samples, noise_scale, seed)

    # STEP 2
    predictions = run_perturbations_through_model(model, perturbed)

    # STEP 3 + 4
    importance_pct, raw_correlations = calculate_feature_importance(perturbed, predictions)

    # STEP 5: sort descending by importance
    results = []
    for i, name in enumerate(feature_names):
        direction = "increases risk" if raw_correlations[i] > 0 else "decreases risk"
        results.append({
            "feature": name,
            "score": round(float(importance_pct[i]), 2),
            "direction": direction
        })
    results.sort(key=lambda x: x["score"], reverse=True)

    elapsed = time.time() - start_time
    return results, elapsed


# ======================================================================
# QUICK TEST - run this file directly to check it works correctly
# ======================================================================
if __name__ == "__main__":
    from neural_network import FeedforwardNeuralNetwork

    print("Testing LIME explainer with a dummy trained network...\n")

    # Create dummy data + train briefly, just to have a "trained" model to explain
    np.random.seed(0)
    X_dummy = np.random.rand(100, 8)
    # Make a clear pattern: feature 0 and 2 matter, others are noise
    y_dummy = ((X_dummy[:, 0] * 0.7 + X_dummy[:, 2] * 0.5) > 0.6).astype(int).reshape(-1, 1)

    nn = FeedforwardNeuralNetwork(input_size=8)
    nn.train(X_dummy, y_dummy, epochs=300, batch_size=16, learning_rate=0.3, verbose=False)

    feature_names = ["glucose", "bmi", "insulin", "age",
                      "blood_pressure", "pregnancies", "skin_thickness", "dpf"]

    # Explain one single "patient"
    test_patient = X_dummy[0]
    results, elapsed = explain_prediction(nn, test_patient, feature_names, num_samples=1000)

    print(f"[Test] LIME explanation generated in {elapsed:.3f} seconds (target: under 2 seconds)\n")
    print(f"{'Feature':20s} {'Importance %':>12s}   Direction")
    print("-" * 55)
    for r in results:
        print(f"{r['feature']:20s} {r['score']:>10.2f}%   {r['direction']}")

    print(f"\nSanity check: 'glucose' and 'insulin' should rank highest (they were")
    print(f"designed to matter most in this dummy data). Top 2 features: "
          f"{results[0]['feature']}, {results[1]['feature']}")

    if elapsed < 2.0:
        print("\nSUCCESS: LIME runs within the 2-second target.")
    else:
        print("\nWARNING: LIME took longer than 2 seconds - may need optimisation.")