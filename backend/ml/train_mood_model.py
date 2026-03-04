"""
Train a mood/depression risk classification model on synthetic PHQ-style data.
Run this once before starting the backend:
    python ml/train_mood_model.py
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib
from pathlib import Path

SEED = 42
N_SAMPLES = 800

rng = np.random.default_rng(SEED)

# Generate synthetic PHQ-7 style responses + sleep/energy
q_scores = rng.integers(0, 4, size=(N_SAMPLES, 7))  # 7 questions, 0-3
sleep_hours = rng.uniform(2, 10, N_SAMPLES)
energy = rng.integers(0, 11, N_SAMPLES)

# Rule-based labeling (reflects clinical PHQ thresholds)
phq_total = q_scores.sum(axis=1)
sleep_deficit = np.clip(7 - sleep_hours, 0, 7)
fatigue_score = np.clip(5 - energy, 0, 5)
composite = phq_total * 1.5 + sleep_deficit * 1.2 + fatigue_score * 1.0

# Add realistic noise
composite += rng.normal(0, 2, N_SAMPLES)
composite = np.clip(composite, 0, 50)

# Labels: 0=Low, 1=Moderate, 2=High
labels = np.where(composite < 12, 0, np.where(composite < 26, 1, 2))

# Build DataFrame
feature_names = [f"q{i+1}" for i in range(7)] + ["sleep_hours", "energy"]
X = np.column_stack([q_scores, sleep_hours, energy])
df = pd.DataFrame(X, columns=feature_names)
df["risk_level"] = labels

print(f"Dataset: {len(df)} samples")
print(f"Class distribution:\n{df['risk_level'].value_counts().sort_index()}\n")

X = df[feature_names].values
y = df["risk_level"].values

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=SEED, stratify=y
)

model = RandomForestClassifier(
    n_estimators=150,
    max_depth=8,
    min_samples_split=5,
    class_weight="balanced",
    random_state=SEED,
)
model.fit(X_train, y_train)

y_pred = model.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print(f"Accuracy: {acc:.3f}")
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=["Low", "Moderate", "High"]))

# Save model
out_path = Path(__file__).parent / "mood_model.pkl"
joblib.dump(model, out_path)
print(f"\nModel saved to: {out_path}")
