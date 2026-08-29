"""The tone regression gate: leave-one-speaker-out accuracy of the trained model
on Tone Perfect (isolated citation-form syllables — the app's actual domain).

Writes eval/scorecards/tone_model.json. This is the number that must not regress.

  python eval/eval_toneperfect.py
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

SPEAKERS = ["FV1", "FV2", "FV3", "MV1", "MV2", "MV3"]


def main() -> None:
    from sklearn.metrics import confusion_matrix
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler

    d = np.load(os.path.join(os.path.dirname(__file__), "data", "tone_perfect.npz"))
    X, y, g = d["X"], d["y"], d["groups"]

    per_speaker = {}
    conf = np.zeros((4, 4), dtype=int)
    for s in range(6):
        tr, te = g != s, g == s
        sc = StandardScaler().fit(X[tr])
        clf = MLPClassifier(hidden_layer_sizes=(48,), alpha=1e-3, max_iter=800, early_stopping=True, random_state=0)
        clf.fit(sc.transform(X[tr]), y[tr])
        pred = clf.predict(sc.transform(X[te]))
        per_speaker[SPEAKERS[s]] = round(float((pred == y[te]).mean()), 3)
        conf += confusion_matrix(y[te], pred, labels=[1, 2, 3, 4])

    mean = round(float(np.mean(list(per_speaker.values()))), 3)
    per_tone = {t + 1: round(conf[t][t] / conf[t].sum(), 3) if conf[t].sum() else None for t in range(4)}
    scorecard = {
        "dataset": "Tone Perfect (isolated citation-form syllables, 6 speakers)",
        "eval": "leave-one-speaker-out (cross-voice generalization)",
        "model": "MLP(48) on contour features, pure-numpy export",
        "tone_accuracy_mean": mean,
        "per_speaker": per_speaker,
        "per_tone_recall": per_tone,
        "confusion_gold_x_pred": conf.tolist(),
        "vs_dsp_baseline": "DSP shape rules: 0.255 on FLEURS (chance)",
    }
    out = os.path.join(os.path.dirname(__file__), "scorecards", "tone_model.json")
    with open(out, "w") as f:
        json.dump(scorecard, f, indent=2, ensure_ascii=False)
    print(f"leave-one-speaker-out mean tone accuracy: {mean:.1%}")
    print(f"per speaker: {per_speaker}")
    print(f"per-tone recall: {per_tone}")
    print(f"scorecard -> {out}")


if __name__ == "__main__":
    main()
