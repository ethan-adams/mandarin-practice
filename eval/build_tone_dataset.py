"""Build a labeled tone training set from real speech (FLEURS Mandarin).

Whisper-free and fast: segments each utterance into voiced islands (the same
`voiced_islands` the runtime uses), keeps only utterances whose island count
matches the gold syllable count (a clean 1:1 alignment), and labels each with its
gold tone (pypinyin). Extracts the SAME `tone_features` the runtime will, so
training and inference cannot drift. Saves X / y / groups (utterance id) to
eval/data/tone_<split>.npz.

  python eval/build_tone_dataset.py [split=train] [N=1500]
"""

from __future__ import annotations

import io
import os
import sys

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
from app.tone_engine import segment_by_energy, track_f0  # noqa: E402
from app.tone_model import tone_features  # noqa: E402

HAN = lambda ch: "一" <= ch <= "鿿"  # noqa: E731

_whisper_model = None


def _whisper_spans(model, audio) -> list[tuple[float, float]]:
    segments, _ = model.transcribe(audio.astype(np.float32), language="zh", beam_size=1, word_timestamps=True)
    spans: list[tuple[float, float]] = []
    for seg in segments:
        for w in getattr(seg, "words", None) or []:
            chars = [c for c in (w.word or "") if HAN(c)]
            if not chars:
                continue
            step = (w.end - w.start) / len(chars)
            spans.extend((w.start + k * step, w.start + (k + 1) * step) for k in range(len(chars)))
    return spans


def gold_tones(text: str) -> list[int]:
    from pypinyin import Style, pinyin

    out: list[int] = []
    for ch in text:
        if not HAN(ch):
            continue
        syl = pinyin(ch, style=Style.TONE3, neutral_tone_with_five=True, errors="ignore")
        digits = [c for c in (syl[0][0] if syl and syl[0] else "") if c.isdigit()]
        out.append(int(digits[-1]) if digits else 5)
    return out


def main() -> None:
    split = sys.argv[1] if len(sys.argv) > 1 else "validation"
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 10000
    import soundfile as sf
    from datasets import Audio, load_dataset

    global _whisper_model
    if os.environ.get("WHISPER"):
        from faster_whisper import WhisperModel

        _whisper_model = WhisperModel("base", device="cpu", compute_type="int8", cpu_threads=max(4, os.cpu_count() or 4))
        print("whisper-aligned segmentation mode", flush=True)

    print(f"loading FLEURS cmn '{split}' (cached after first download) …", flush=True)
    ds = load_dataset("google/fleurs", "cmn_hans_cn", split=split)
    ds = ds.cast_column("audio", Audio(decode=False))
    print(f"loaded {len(ds)} utterances; segmenting by voiced islands …", flush=True)

    X: list[np.ndarray] = []
    y: list[int] = []
    groups: list[int] = []
    kept = seen = 0

    for i, ex in enumerate(ds):
        if i >= n:
            break
        seen += 1
        raw = ex["audio"].get("bytes") or open(ex["audio"]["path"], "rb").read()
        arr, sr = sf.read(io.BytesIO(raw), dtype="float32")
        audio = np.asarray(arr, dtype=np.float64)
        if audio.ndim > 1:
            audio = audio.mean(axis=1)
        gold = gold_tones(ex.get("transcription") or ex.get("raw_transcription") or "")
        graded_idx = [k for k, t in enumerate(gold) if t not in (0, 5)]
        if not gold:
            continue

        times, f0 = track_f0(audio, sr)
        voiced = f0[~np.isnan(f0)]
        if voiced.size < 6:
            continue
        if _whisper_model is not None:  # clean whisper-aligned segmentation
            windows = _whisper_spans(_whisper_model, audio)
            if len(windows) != len(gold):
                continue
        else:
            windows = segment_by_energy(audio, sr, len(gold))
            if len(windows) != len(gold):
                continue
        reference = float(np.median(voiced))

        for k in graded_idx:
            a, b = windows[k]
            seg_hz = f0[(times >= a) & (times <= b) & ~np.isnan(f0)]
            feats = tone_features(seg_hz, reference)
            if feats is None:
                continue
            X.append(feats)
            y.append(gold[k])
            groups.append(i)
        kept += 1
        if seen % 200 == 0:
            print(f"  seen {seen}, kept {kept} utterances, {len(y)} syllables …", flush=True)

    os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)
    out = os.path.join(os.path.dirname(__file__), "data", f"tone_{split}.npz")
    np.savez(out, X=np.array(X), y=np.array(y), groups=np.array(groups))
    counts = {t: int((np.array(y) == t).sum()) for t in (1, 2, 3, 4)} if y else {}
    print(f"\nsaved {len(y)} syllables from {kept}/{seen} utterances -> {out}")
    print(f"per-tone counts: {counts}")


if __name__ == "__main__":
    main()
