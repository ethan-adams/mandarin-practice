"""Is tone SAFE to grade the SRS? The false-off curve.

Re-enabling tone in scheduling means demoting a correct-WORD attempt to 'hard'
when the model says the TONE is wrong. The risk is a FALSE OFF: the learner said
the tone correctly, but the model mispredicts and wrongly demotes the card. The
guardrail is "never let an unvalidated signal grade SRS," so we must know that
false-off rate BEFORE wiring anything — and gate it behind a confidence
threshold so we only demote when the model is sure.

This measures, leave-one-SPEAKER-out (the honest cross-voice test — a new user's
voice was never trained on), the model's softmax confidence, and for a sweep of
thresholds τ reports:

  coverage            P(max_prob >= τ)                 — how often we'd act
  false_off (overall) P(argmax != true AND conf>=τ)    — correct attempts wrongly demoted
  false_off per tone  same, conditioned on true tone   — T3 is the danger tone
  confident_acc       P(argmax==true | conf>=τ)        — quality when we do act

All clips are correct native productions, so every misclassification here is a
false off. Writes eval/scorecards/tone_confidence.json.

  python eval/eval_tone_confidence.py
"""

from __future__ import annotations

import json
import os

import numpy as np

HERE = os.path.dirname(__file__)
SPEAKERS = ["FV1", "FV2", "FV3", "MV1", "MV2", "MV3"]
THRESHOLDS = [0.0, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]


def main() -> None:
    from sklearn.neural_network import MLPClassifier
    from sklearn.preprocessing import StandardScaler

    d = np.load(os.path.join(HERE, "data", "tone_perfect.npz"))
    X, y, g = d["X"], d["y"], d["groups"]

    # Leave-one-speaker-out: collect held-out (true, pred, max_prob) for every clip.
    true = np.empty(0, dtype=int)
    pred = np.empty(0, dtype=int)
    conf = np.empty(0, dtype=float)
    for s in range(6):
        tr, te = g != s, g == s
        sc = StandardScaler().fit(X[tr])
        clf = MLPClassifier(hidden_layer_sizes=(48,), alpha=1e-3, max_iter=800, early_stopping=True, random_state=0)
        clf.fit(sc.transform(X[tr]), y[tr])
        proba = clf.predict_proba(sc.transform(X[te]))
        classes = clf.classes_
        p_idx = np.argmax(proba, axis=1)
        true = np.concatenate([true, y[te]])
        pred = np.concatenate([pred, classes[p_idx]])
        conf = np.concatenate([conf, proba[np.arange(len(p_idx)), p_idx]])

    rows = []
    for tau in THRESHOLDS:
        act = conf >= tau
        wrong = pred != true
        coverage = float(act.mean())
        false_off = float((wrong & act).mean())  # over ALL correct clips
        confident_acc = float((~wrong)[act].mean()) if act.any() else None
        per_tone = {}
        for t in (1, 2, 3, 4):
            m = true == t
            per_tone[t] = round(float((wrong & act)[m].mean()), 4) if m.any() else None
        rows.append({
            "tau": tau,
            "coverage": round(coverage, 4),
            "false_off_overall": round(false_off, 4),
            "false_off_per_tone": per_tone,
            "confident_acc": round(confident_acc, 4) if confident_acc is not None else None,
        })
        pt = " ".join(f"T{t}={per_tone[t]:.3f}" for t in (1, 2, 3, 4))
        print(f"τ={tau:<4} cover={coverage:.3f} falseoff={false_off:.3f} [{pt}] conf_acc={confident_acc}", flush=True)

    scorecard = {
        "purpose": "False-off curve — the safety gate for demoting a card on a confident tone miss.",
        "eval": "leave-one-speaker-out on Tone Perfect (all clips are correct native productions, so any miss is a false off)",
        "model": "MLP(48) softmax confidence (mirrors the deployed pure-numpy model on a NEW voice)",
        "note": "false_off is the fraction of CORRECT attempts wrongly demoted at threshold τ; pick τ where per-tone (esp T3) stays low.",
        "thresholds": rows,
    }
    out = os.path.join(HERE, "scorecards", "tone_confidence.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(scorecard, f, indent=2, ensure_ascii=False)
    print(f"scorecard -> {out}", flush=True)


if __name__ == "__main__":
    main()
