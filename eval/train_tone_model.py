"""Train the tone classifier on the real-speech dataset and export pure-NumPy
weights to server/app/tone_model.npz (committed, tiny).

A small standardized-input MLP (one hidden layer). Held-out split is
UTTERANCE-DISJOINT (GroupShuffleSplit on utterance id) so the reported number
reflects generalization to unseen voices/utterances, not memorization.

  python eval/train_tone_model.py
"""

from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

DATA = os.path.join(os.path.dirname(__file__), "data", sys.argv[1] if len(sys.argv) > 1 else "tone_validation.npz")
OUT = os.path.join(os.path.dirname(__file__), "..", "server", "app", "tone_model.npz")


def main() -> None:
    from sklearn.metrics import accuracy_score, confusion_matrix
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler

    d = np.load(DATA)
    X, y, groups = d["X"], d["y"], d["groups"]
    print(f"{len(y)} syllables, {len(set(groups.tolist()))} utterances, dim={X.shape[1]}")

    tr, te = next(GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=0).split(X, y, groups))
    scaler = StandardScaler().fit(X[tr])
    Xtr, Xte = scaler.transform(X[tr]), scaler.transform(X[te])

    clf = MLPClassifier(
        hidden_layer_sizes=(48,),
        activation="relu",
        alpha=1e-3,
        max_iter=800,
        early_stopping=True,
        random_state=0,
    ).fit(Xtr, y[tr])

    pred = clf.predict(Xte)
    acc = accuracy_score(y[te], pred)
    cm = confusion_matrix(y[te], pred, labels=[1, 2, 3, 4])
    print(f"\nheld-out (utterance-disjoint) tone accuracy: {acc:.1%}")
    print("gold\\pred   T1   T2   T3   T4")
    for i, t in enumerate([1, 2, 3, 4]):
        row = cm[i]
        rec = row[i] / row.sum() if row.sum() else 0
        print(f"  T{t}     " + " ".join(f"{v:4d}" for v in row) + f"   recall={rec:.2f}")

    # Export a model refit on ALL data (max signal for production); the held-out
    # number above is the honest generalization estimate. Pure-numpy weights:
    # sklearn coefs_ = [W0(in,h), W1(h,out)], intercepts_ = [b0, b1].
    full_scaler = StandardScaler().fit(X)
    full_clf = MLPClassifier(
        hidden_layer_sizes=(48,), activation="relu", alpha=1e-3, max_iter=800, early_stopping=True, random_state=0
    ).fit(full_scaler.transform(X), y)
    np.savez(
        OUT,
        scaler_mean=full_scaler.mean_,
        scaler_scale=full_scaler.scale_,
        W0=full_clf.coefs_[0],
        b0=full_clf.intercepts_[0],
        W1=full_clf.coefs_[1],
        b1=full_clf.intercepts_[1],
        classes=full_clf.classes_,
    )
    size = os.path.getsize(OUT)
    print(f"\nexported -> {OUT} ({size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
