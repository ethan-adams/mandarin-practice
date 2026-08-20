#!/usr/bin/env python3
"""Extract a pitch contour from each prebuilt reference clip so the app can score
a learner's spoken tone against the NATIVE reference (see VISION.md
"Pronunciation"). Output is public/mandarin-contours.json, keyed by answerZh.

A contour is a fixed-length series of semitones relative to the clip's own median
pitch — pitch SHAPE only, so it matches the app's runtime representation
(src/lib/utils/mandarinToneReference.ts toSemitoneContour). The pitch tracker is
autocorrelation over 70–500 Hz, mirroring the app's detectPitchFromTimeDomain.

Usage (from factory/):
  uv run python scripts/gen_contours.py
"""
from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import numpy as np

FACTORY_ROOT = Path(__file__).resolve().parent.parent
AUDIO_ROOT = FACTORY_ROOT / "lessons" / "audio" / "corpus"
MANIFEST_PATH = AUDIO_ROOT / "manifest.json"
OUT_PATH = FACTORY_ROOT.parent / "public" / "mandarin-contours.json"

SR = 16000
POINTS = 24
WIN = 1024
HOP = 256
MIN_LAG = SR // 500
MAX_LAG = SR // 70


def decode_pcm(path: Path) -> np.ndarray:
    proc = subprocess.run(
        ["ffmpeg", "-v", "quiet", "-i", str(path), "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
        capture_output=True,
    )
    return np.frombuffer(proc.stdout, dtype=np.float32)


def f0_series(samples: np.ndarray) -> list[float]:
    out: list[float] = []
    for start in range(0, max(0, len(samples) - WIN), HOP):
        frame = samples[start : start + WIN]
        rms = float(np.sqrt(np.mean(frame * frame)))
        if rms < 0.01:
            out.append(0.0)
            continue
        centered = frame - float(frame.mean())
        corr = np.correlate(centered, centered, "full")[WIN - 1 :]
        if corr[0] <= 0:
            out.append(0.0)
            continue
        seg = corr[MIN_LAG:MAX_LAG]
        if seg.size == 0:
            out.append(0.0)
            continue
        lag = MIN_LAG + int(np.argmax(seg))
        if corr[lag] / corr[0] < 0.3:  # not periodic enough -> unvoiced
            out.append(0.0)
            continue
        out.append(SR / lag)
    return out


def contour(samples: np.ndarray) -> list[float] | None:
    voiced = [f for f in f0_series(samples) if f > 0]
    if len(voiced) < 3:
        return None
    med = float(np.median(voiced))
    if med <= 0:
        return None
    # Octave-error correction: TTS pitch trackers occasionally jump an octave,
    # which swamps the real tone. Fold each value to within ~an octave of the
    # median (real Mandarin tones stay well inside that band).
    folded = []
    for f in voiced:
        while f > med * 1.6:
            f /= 2
        while f < med / 1.6:
            f *= 2
        folded.append(f)
    # Light median smoothing removes single-frame spikes at onset/offset.
    smoothed = [float(np.median(folded[max(0, i - 1) : i + 2])) for i in range(len(folded))]
    med2 = float(np.median(smoothed))
    semis = np.array([12 * math.log2(f / med2) for f in smoothed])
    xs = np.linspace(0, len(semis) - 1, POINTS)
    res = np.interp(xs, np.arange(len(semis)), semis)
    return [round(float(v), 2) for v in res]


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = manifest["entries"]
    contours: dict[str, list[float]] = {}
    total = len(entries)
    done = 0
    skipped = 0
    for text, key in entries.items():
        path = AUDIO_ROOT / key
        done += 1
        if not path.exists():
            skipped += 1
            continue
        c = contour(decode_pcm(path))
        if c is None:
            skipped += 1
            continue
        contours[text] = c
        if done % 250 == 0 or done == total:
            print(f"  {done}/{total} ({skipped} skipped)")

    payload = {"version": 1, "points": POINTS, "entries": contours}
    OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"wrote {len(contours)} contours to {OUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
