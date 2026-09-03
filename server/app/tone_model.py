"""Trained tone classifier: features + pure-NumPy inference.

The hand-tuned DSP shape rules score ~chance on real voices (eval/scorecards/
tone_baseline.json: 25.5%). This replaces them with a small model trained offline
on real speech (eval/train_tone_model.py), exported to a tiny committed .npz and
run as plain matmuls here — no torch/sklearn on the box, still $0.

`tone_features` is the SINGLE source of the feature vector, imported by both the
offline trainer and the runtime, so training and inference can never drift.
"""

from __future__ import annotations

import os
from typing import Optional

import numpy as np

N_POINTS = 16  # resampled contour length
FEATURE_DIM = N_POINTS + 4
_MODEL_PATH = os.path.join(os.path.dirname(__file__), "tone_model.npz")

# Predicted tone -> the shape word the rest of the app speaks in.
TONE_SHAPE_NAME = {1: "level", 2: "rising", 3: "dipping", 4: "falling"}


def tone_features(seg_hz: np.ndarray, reference_hz: float, n_points: int = N_POINTS) -> Optional[np.ndarray]:
    """Feature vector for one syllable's voiced F0, or None if too little voiced
    audio. Pitch is in semitones vs. the utterance reference (so height — tone 1
    is *high* — is preserved and the whole thing is speaker/gain independent).

    Layout: [contour(n_points)] + [range, net-slope, mid-curvature, log-duration].
    Curvature separates the tone-3 dip; height lives in the contour itself."""
    seg = np.asarray(seg_hz, dtype=np.float64)
    seg = seg[np.isfinite(seg) & (seg > 0)]
    if seg.size < 3 or reference_hz <= 0:
        return None
    semis = 12.0 * np.log2(seg / reference_hz)
    xs = np.linspace(0.0, semis.size - 1, n_points)
    contour = np.interp(xs, np.arange(semis.size), semis)
    rng = float(np.max(semis) - np.min(semis))
    slope = float(contour[-1] - contour[0])
    curv = float(contour[n_points // 2] - 0.5 * (contour[0] + contour[-1]))
    log_dur = float(np.log1p(seg.size))
    return np.concatenate([contour, [rng, slope, curv, log_dur]]).astype(np.float64)


class ToneModel:
    """A tiny MLP (one hidden layer) standardized-input classifier, run in NumPy."""

    def __init__(self, path: str):
        d = np.load(path)
        self.mean = d["scaler_mean"]
        self.scale = d["scaler_scale"]
        self.W0, self.b0 = d["W0"], d["b0"]
        self.W1, self.b1 = d["W1"], d["b1"]
        self.classes = d["classes"]

    def predict(self, feats: np.ndarray) -> int:
        x = (feats - self.mean) / self.scale
        h = np.maximum(x @ self.W0 + self.b0, 0.0)  # relu
        logits = h @ self.W1 + self.b1
        return int(self.classes[int(np.argmax(logits))])

    def predict_conf(self, feats: np.ndarray) -> tuple[int, float]:
        """Predicted tone AND its softmax confidence. The confidence gates whether
        a miss is allowed to demote the SRS: eval/scorecards/tone_confidence.json
        measured the false-off rate vs. this probability (1.9% at >=0.90)."""
        x = (feats - self.mean) / self.scale
        h = np.maximum(x @ self.W0 + self.b0, 0.0)  # relu
        logits = h @ self.W1 + self.b1
        e = np.exp(logits - np.max(logits))
        probs = e / e.sum()
        i = int(np.argmax(probs))
        return int(self.classes[i]), float(probs[i])


_model: Optional[ToneModel] | str = "unset"


def get_tone_model() -> Optional[ToneModel]:
    """Load the committed model once; None if it hasn't been trained yet (the DSP
    path stays as a fallback so nothing breaks before Phase B lands)."""
    global _model
    if _model == "unset":
        try:
            _model = ToneModel(_MODEL_PATH) if os.path.exists(_MODEL_PATH) else None
        except Exception:
            _model = None
    return _model  # type: ignore[return-value]
