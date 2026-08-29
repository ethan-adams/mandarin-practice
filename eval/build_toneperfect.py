"""Build the tone dataset from Tone Perfect (isolated citation-form syllables).

Each file IS one labeled syllable (filename `a1_FV1_MP3.mp3` = syllable, tone,
speaker), so there is NO segmentation problem — the app's actual domain. Groups
are SPEAKERS, so the trainer's held-out split is a true cross-voice test (the
exact failure mode that sank the DSP rules). Saves X / y / groups to
eval/data/tone_perfect.npz.

Note: Tone Perfect is non-commercial (see eval/README.md). Used here for a free,
non-commercial personal app; if this is ever monetized the model must be retrained
on permissively-licensed data.

  python eval/build_toneperfect.py
"""

from __future__ import annotations

import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
from app.audio_decode import decode_to_mono  # noqa: E402
from app.tone_engine import track_f0  # noqa: E402
from app.tone_model import tone_features  # noqa: E402

MP3_DIR = os.path.join(os.path.dirname(__file__), "data", "tone_perfect")
SPEAKERS = ["FV1", "FV2", "FV3", "MV1", "MV2", "MV3"]
NAME = re.compile(r"^([a-zü:v]+)([1-4])_([FM]V[123])_")


def main() -> None:
    files = sorted(f for f in os.listdir(MP3_DIR) if f.endswith(".mp3"))
    print(f"{len(files)} Tone Perfect clips; extracting F0 features …", flush=True)

    X: list[np.ndarray] = []
    y: list[int] = []
    groups: list[int] = []
    for i, fn in enumerate(files):
        m = NAME.match(fn)
        if not m:
            continue
        tone = int(m.group(2))
        speaker = SPEAKERS.index(m.group(3))
        with open(os.path.join(MP3_DIR, fn), "rb") as fh:
            samples, sr = decode_to_mono(fh.read(), target_sr=16_000)
        if samples.size < 400:
            continue
        _times, f0 = track_f0(samples, sr)
        voiced = f0[~np.isnan(f0)]
        if voiced.size < 4:
            continue
        feats = tone_features(voiced, float(np.median(voiced)))
        if feats is None:
            continue
        X.append(feats)
        y.append(tone)
        groups.append(speaker)
        if (i + 1) % 2000 == 0:
            print(f"  {i + 1}/{len(files)} …", flush=True)

    out = os.path.join(os.path.dirname(__file__), "data", "tone_perfect.npz")
    np.savez(out, X=np.array(X), y=np.array(y), groups=np.array(groups))
    counts = {t: int((np.array(y) == t).sum()) for t in (1, 2, 3, 4)}
    print(f"\nsaved {len(y)} syllables -> {out}")
    print(f"per-tone: {counts} | speakers: {sorted(set(groups))}")


if __name__ == "__main__":
    main()
