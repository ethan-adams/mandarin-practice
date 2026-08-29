"""Phase A: measure the CURRENT tone engine on REAL human voices.

Runs the exact production pipeline — faster-whisper word timings segment the
utterance, then `server/app/tone_engine.assess_tones` classifies each syllable —
against FLEURS Mandarin (google/fleurs cmn_hans_cn, CC BY 4.0, real native
speakers), with gold per-syllable tones from pypinyin. Emits a confusion matrix
and the two numbers the app acts on, into eval/scorecards/.

This is the ground-truth number that has been missing: no synthetic audio, no
human in the loop. Run:  python eval/tone_eval.py [N]
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
from app.tone_engine import assess_tones  # noqa: E402

HAN = lambda ch: "一" <= ch <= "鿿"  # noqa: E731


def gold_tones(text: str) -> list[int]:
    """Per-Han-character tone (1-4, 5=neutral) via pypinyin."""
    from pypinyin import Style, pinyin

    out: list[int] = []
    for ch in text:
        if not HAN(ch):
            continue
        syl = pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True, errors="ignore")
        if not syl or not syl[0]:
            out.append(0)
            continue
        digits = [c for c in syl[0][0] if c.isdigit()]
        out.append(int(digits[-1]) if digits else 5)
    return out


# Map an assessor's observed shape back to the tone it best represents, so we can
# score prediction vs. gold as a 4-way (+neutral) classification.
SHAPE_TO_TONE = {"level": 1, "rising": 2, "dipping": 3, "falling": 4, "unvoiced": 0}


def main() -> None:
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 150
    import io

    import soundfile as sf
    from datasets import Audio, load_dataset
    from faster_whisper import WhisperModel

    print(f"loading whisper base + streaming {n} FLEURS cmn utterances …")
    model = WhisperModel("base", device="cpu", compute_type="int8")
    ds = load_dataset("google/fleurs", "cmn_hans_cn", split="test", streaming=True)
    # Decode audio ourselves (soundfile) instead of the datasets torchcodec path,
    # to stay torch-free.
    ds = ds.cast_column("audio", Audio(decode=False))

    # confusion[gold][pred]; tones 1-4 (index 0-3). Neutral excluded from matrix.
    confusion = np.zeros((4, 4), dtype=int)
    seg_ok = seg_total = 0
    graded = 0

    for i, ex in enumerate(ds):
        if i >= n:
            break
        raw = ex["audio"].get("bytes")
        if raw is None:
            with open(ex["audio"]["path"], "rb") as fh:
                raw = fh.read()
        arr, sr = sf.read(io.BytesIO(raw), dtype="float32")
        audio = np.asarray(arr, dtype=np.float64)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        text = ex.get("transcription") or ex.get("raw_transcription") or ""
        gold = gold_tones(text)
        if not gold:
            continue

        # Production segmentation: whisper word timings -> per-Han-char spans.
        segments, _ = model.transcribe(audio.astype(np.float32), language="zh", beam_size=1, word_timestamps=True)
        spans: list[tuple[float, float]] = []
        for seg in segments:
            for w in getattr(seg, "words", None) or []:
                chars = [c for c in (w.word or "") if HAN(c)]
                if not chars:
                    continue
                step = (w.end - w.start) / len(chars)
                spans.extend((w.start + k * step, w.start + (k + 1) * step) for k in range(len(chars)))

        seg_total += 1
        # Clean 1:1 case: whisper found exactly the gold number of syllables.
        if len(spans) != len(gold):
            continue
        seg_ok += 1

        result = assess_tones(audio, sr, gold, spans)
        for syl, g in zip(result.syllables, gold):
            if g in (0, 5):
                continue
            pred = SHAPE_TO_TONE.get(syl.observed, 0)
            if pred in (1, 2, 3, 4):
                confusion[g - 1][pred - 1] += 1
                graded += 1

        if (i + 1) % 25 == 0:
            print(f"  {i + 1} utterances, {graded} graded syllables …")

    total = int(confusion.sum())
    correct = int(np.trace(confusion))
    acc = correct / total if total else 0.0
    per_tone = {}
    for t in range(4):
        tp = confusion[t][t]
        gold_n = confusion[t].sum()
        pred_n = confusion[:, t].sum()
        per_tone[t + 1] = {
            "recall": round(tp / gold_n, 3) if gold_n else None,
            "precision": round(tp / pred_n, 3) if pred_n else None,
            "n": int(gold_n),
        }

    scorecard = {
        "dataset": "google/fleurs cmn_hans_cn test",
        "engine": "tone_engine.assess_tones (DSP thresholds, pre-model)",
        "utterances": seg_total,
        "segmentation_1to1_rate": round(seg_ok / seg_total, 3) if seg_total else None,
        "graded_syllables": total,
        "tone_accuracy": round(acc, 3),
        "per_tone": per_tone,
        "confusion_gold_x_pred": confusion.tolist(),
    }
    os.makedirs(os.path.join(os.path.dirname(__file__), "scorecards"), exist_ok=True)
    out = os.path.join(os.path.dirname(__file__), "scorecards", "tone_baseline.json")
    with open(out, "w") as f:
        json.dump(scorecard, f, indent=2, ensure_ascii=False)

    print("\n=== TONE BASELINE (real voices) ===")
    print(f"utterances scored: {seg_total} | clean 1:1 segmentation: {scorecard['segmentation_1to1_rate']}")
    print(f"graded syllables: {total} | tone accuracy: {acc:.1%}")
    print("gold\\pred   T1   T2   T3   T4   (rows=gold tone, cols=predicted)")
    for t in range(4):
        print(f"  T{t + 1}     " + " ".join(f"{confusion[t][p]:4d}" for p in range(4)))
    for t, m in per_tone.items():
        print(f"  T{t}: recall={m['recall']} precision={m['precision']} (n={m['n']})")
    print(f"\nscorecard -> {out}")


if __name__ == "__main__":
    main()
