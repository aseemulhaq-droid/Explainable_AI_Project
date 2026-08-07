"""


Architecture (fixed, from spec):
    Input Layer   -> size varies per disease (8 / 13 / 30 / 10)
    Hidden Layer 1 -> 128 neurons, ReLU activation
    Dropout        -> rate 0.3 (only active during training)
    Hidden Layer 2 -> 64 neurons, ReLU activation
    Output Layer   -> 1 neuron, Sigmoid activation (probability 0-1)

Training method:
    - He Initialisation for weights
    - Binary Cross-Entropy loss
    - Backpropagation + Mini-Batch Gradient Descent
---------------------------------------------------------
"""

import numpy as np


class FeedforwardNeuralNetwork:
    """
    A neural network with 2 hidden layers, built entirely from scratch.

    Think of this class as one "brain" that:
    1. Takes patient numbers in (forward pass)
    2. Makes a guess (0 to 1 probability of disease)
    3. Checks how wrong the guess was (loss)
    4. Adjusts itself to do better next time (backward pass)
    """

    def __init__(self, input_size, hidden1_size=128, hidden2_size=64, dropout_rate=0.3):
        """
        Sets up the network's starting weights and biases.

        input_size    -> number of features (8 for diabetes, 13 for heart, etc.)
        hidden1_size  -> neurons in hidden layer 1 (128, fixed by spec)
        hidden2_size  -> neurons in hidden layer 2 (64, fixed by spec)
        dropout_rate  -> fraction of neurons randomly "switched off" during
                         training to prevent overfitting (0.3 = 30%)
        """
        self.dropout_rate = dropout_rate

        # ------------------------------------------------------------
        # HE INITIALISATION
        # Why: if weights start too big or too small, the network learns
        # very slowly or not at all. He Initialisation is a formula that
        # picks a good starting scale specifically for ReLU networks.
        # Formula: random numbers * sqrt(2 / number_of_inputs_to_this_layer)
        # ------------------------------------------------------------
        self.W1 = np.random.randn(input_size, hidden1_size) * np.sqrt(2.0 / input_size)
        self.b1 = np.zeros((1, hidden1_size))

        self.W2 = np.random.randn(hidden1_size, hidden2_size) * np.sqrt(2.0 / hidden1_size)
        self.b2 = np.zeros((1, hidden2_size))

        self.W3 = np.random.randn(hidden2_size, 1) * np.sqrt(2.0 / hidden2_size)
        self.b3 = np.zeros((1, 1))

    # ==================================================================
    # ACTIVATION FUNCTIONS
    # ==================================================================
    @staticmethod
    def relu(Z):
        """
        ReLU (Rectified Linear Unit): turns every negative number into 0,
        keeps positive numbers as they are.
        Why: lets the network learn non-linear (curved, complex) patterns.
        """
        return np.maximum(0, Z)

    @staticmethod
    def relu_derivative(Z):
        """Slope of ReLU: 1 where Z was positive, 0 where Z was negative/zero."""
        return (Z > 0).astype(float)

    @staticmethod
    def sigmoid(Z):
        """
        Sigmoid: squashes any number into a range between 0 and 1.
        Why: our output needs to be a PROBABILITY (0 = no disease, 1 = disease).
        Clipping avoids overflow errors for very large/small Z.
        """
        Z = np.clip(Z, -500, 500)
        return 1.0 / (1.0 + np.exp(-Z))

    # ==================================================================
    # FORWARD PASS
    # ==================================================================
    def forward(self, X, training=True):
        """
        Pushes patient data THROUGH the network to get a prediction.

        X -> NumPy array, shape (num_patients, num_features)
             e.g. (32, 8) = 32 patients, 8 features each (diabetes)

        training -> True during training (applies dropout)
                    False during real predictions (dropout OFF)

        Returns: predictions, shape (num_patients, 1) - probability 0 to 1
        """
        # ---- Layer 1: Input -> Hidden1 (ReLU) ----
        self.Z1 = X @ self.W1 + self.b1          # linear step: (X * weights) + bias
        self.A1 = self.relu(self.Z1)             # activation step

        # ---- Dropout (only during training) ----
        if training:
            # Randomly "kill" dropout_rate fraction of neurons this pass
            self.dropout_mask = (np.random.rand(*self.A1.shape) > self.dropout_rate).astype(float)
            # Scale up survivors so the overall signal strength stays balanced
            self.A1_dropped = (self.A1 * self.dropout_mask) / (1 - self.dropout_rate)
        else:
            self.A1_dropped = self.A1

        # ---- Layer 2: Hidden1 -> Hidden2 (ReLU) ----
        self.Z2 = self.A1_dropped @ self.W2 + self.b2
        self.A2 = self.relu(self.Z2)

        # ---- Output Layer: Hidden2 -> Output (Sigmoid) ----
        self.Z3 = self.A2 @ self.W3 + self.b3
        self.A3 = self.sigmoid(self.Z3)

        self.X = X  # saved for use during backpropagation
        return self.A3

    # ==================================================================
    # LOSS FUNCTION
    # ==================================================================
    @staticmethod
    def binary_cross_entropy(y_true, y_pred):
        """
        Measures how WRONG the predictions were.
        y_true -> actual answers (0 or 1), shape (num_patients, 1)
        y_pred -> model's predicted probabilities, shape (num_patients, 1)

        Formula: -average( y*log(pred) + (1-y)*log(1-pred) )
        Intuition: heavily punishes confident WRONG answers
                   (e.g. predicting 0.99 "disease" when the real answer is 0)
        """
        epsilon = 1e-8  # tiny number to avoid log(0), which is undefined
        y_pred = np.clip(y_pred, epsilon, 1 - epsilon)
        loss = -np.mean(y_true * np.log(y_pred) + (1 - y_true) * np.log(1 - y_pred))
        return loss

    # ==================================================================
    # BACKWARD PASS (Backpropagation)
    # ==================================================================
    def backward(self, y_true, learning_rate=0.01):
        """
        Works BACKWARDS from the output to figure out how much each
        weight contributed to the error, then nudges every weight
        slightly to reduce that error next time.

        This is calculus (chain rule) applied layer by layer -
        but you don't need to derive it yourself, just understand
        the general idea: "how much did this weight contribute to
        the mistake, and which direction should it move?"
        """
        m = y_true.shape[0]  # number of patients in this batch

        # ---- Output layer gradient ----
        # For Sigmoid + Binary Cross-Entropy together, the gradient
        # simplifies neatly to (prediction - actual):
        dZ3 = self.A3 - y_true                         # (m, 1)
        dW3 = (self.A2.T @ dZ3) / m
        db3 = np.sum(dZ3, axis=0, keepdims=True) / m

        # ---- Hidden Layer 2 gradient ----
        dA2 = dZ3 @ self.W3.T
        dZ2 = dA2 * self.relu_derivative(self.Z2)
        dW2 = (self.A1_dropped.T @ dZ2) / m
        db2 = np.sum(dZ2, axis=0, keepdims=True) / m

        # ---- Hidden Layer 1 gradient (through dropout) ----
        dA1 = dZ2 @ self.W2.T
        dA1 = (dA1 * self.dropout_mask) / (1 - self.dropout_rate)  # undo dropout scaling
        dZ1 = dA1 * self.relu_derivative(self.Z1)
        dW1 = (self.X.T @ dZ1) / m
        db1 = np.sum(dZ1, axis=0, keepdims=True) / m

        # ---- Gradient Descent weight update ----
        # Move every weight a small step OPPOSITE to its gradient
        # (gradient points "uphill" toward more error, so we go the other way)
        self.W3 -= learning_rate * dW3
        self.b3 -= learning_rate * db3
        self.W2 -= learning_rate * dW2
        self.b2 -= learning_rate * db2
        self.W1 -= learning_rate * dW1
        self.b1 -= learning_rate * db1

    # ==================================================================
    # TRAINING LOOP (Mini-Batch Gradient Descent)
    # ==================================================================
    def train(self, X_train, y_train, epochs=500, batch_size=32, learning_rate=0.01, verbose=True):
        """
        Trains the network over many epochs (full passes through the data).

        Each epoch:
        1. Shuffle the data (so batches differ each time)
        2. Split into mini-batches (small groups, e.g. 32 patients at a time)
        3. For each batch: forward pass -> compute loss -> backward pass -> update weights
        """
        y_train = y_train.reshape(-1, 1)  # ensure shape (num_patients, 1)
        n_samples = X_train.shape[0]
        loss_history = []

        for epoch in range(epochs):
            # Shuffle data each epoch
            permutation = np.random.permutation(n_samples)
            X_shuffled = X_train[permutation]
            y_shuffled = y_train[permutation]

            epoch_losses = []
            for start in range(0, n_samples, batch_size):
                end = start + batch_size
                X_batch = X_shuffled[start:end]
                y_batch = y_shuffled[start:end]

                predictions = self.forward(X_batch, training=True)
                loss = self.binary_cross_entropy(y_batch, predictions)
                epoch_losses.append(loss)

                self.backward(y_batch, learning_rate)

            avg_loss = np.mean(epoch_losses)
            loss_history.append(avg_loss)

            if verbose and (epoch % 50 == 0 or epoch == epochs - 1):
                print(f"  Epoch {epoch:4d}/{epochs}  -  Loss: {avg_loss:.4f}")

        return loss_history

    # ==================================================================
    # PREDICTION (dropout OFF)
    # ==================================================================
    def predict(self, X, threshold=0.5):
        """
        Real prediction for new patients - dropout is OFF here,
        since dropout is only a training trick, not used at inference time.
        Returns: (probabilities, binary_predictions)
        """
        probabilities = self.forward(X, training=False)
        binary_predictions = (probabilities >= threshold).astype(int)
        return probabilities, binary_predictions

    # ==================================================================
    # SAVE / LOAD WEIGHTS (.npy files, per spec Section 3.2)
    # ==================================================================
    def save_weights(self, filepath):
        """Saves all weights and biases into one .npy file."""
        np.save(filepath, {
            "W1": self.W1, "b1": self.b1,
            "W2": self.W2, "b2": self.b2,
            "W3": self.W3, "b3": self.b3
        })
        print(f"Weights saved to {filepath}")

    def load_weights(self, filepath):
        """Loads previously trained weights back into this network."""
        data = np.load(filepath, allow_pickle=True).item()
        self.W1, self.b1 = data["W1"], data["b1"]
        self.W2, self.b2 = data["W2"], data["b2"]
        self.W3, self.b3 = data["W3"], data["b3"]
        print(f"Weights loaded from {filepath}")


# ======================================================================
# QUICK TEST — run this file directly to sanity-check the network
# BEFORE training on real data (this is what Step 5 in your plan asks for)
# ======================================================================
if __name__ == "__main__":
    print("Testing FNN with dummy random data...\n")

    np.random.seed(42)

    # Simulate 20 fake "patients" with 8 fake features (like diabetes)
    X_dummy = np.random.rand(20, 8)
    y_dummy = np.random.randint(0, 2, size=(20, 1))  # random 0/1 answers

    nn = FeedforwardNeuralNetwork(input_size=8)

    # 1. Check forward pass output shape
    output = nn.forward(X_dummy, training=True)
    print(f"[Test 1] Forward pass output shape: {output.shape}  (expected: (20, 1))")
    print(f"          Sample predictions: {output[:5].flatten()}")

    # 2. Check loss calculation works
    loss = nn.binary_cross_entropy(y_dummy, output)
    print(f"\n[Test 2] Initial loss (should be a positive number, ~0.6-0.8): {loss:.4f}")

    # 3. Check training actually reduces loss over time
    print(f"\n[Test 3] Training for 200 epochs on dummy data (loss should go DOWN):")
    history = nn.train(X_dummy, y_dummy, epochs=200, batch_size=4, learning_rate=0.1)
    print(f"\n  Loss went from {history[0]:.4f} -> {history[-1]:.4f}")
    if history[-1] < history[0]:
        print("  SUCCESS: Loss decreased. Backpropagation is working correctly.")
    else:
        print("  WARNING: Loss did not decrease - something may be wrong.")

    # 4. Check prediction works with dropout OFF
    probs, preds = nn.predict(X_dummy)
    print(f"\n[Test 4] Prediction shape: {probs.shape}, Binary predictions sample: {preds[:5].flatten()}")

    print("\nAll basic tests complete. If Test 3 showed SUCCESS, your FNN is working correctly.")