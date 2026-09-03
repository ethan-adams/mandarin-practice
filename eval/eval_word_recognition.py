"""Phase C — the word-recognition gate: does the production whisper actually
recover the word the learner said?

Runs the SAME faster-whisper the box runs (base / int8 / cpu, language=zh,
beam_size=1) over REAL native audio, and scores it the way the app scores a
word — BY SOUND (toneless pinyin), so a homophone counts as correct (the app's
compareBySound rule). Emits eval/scorecards/word_recognition.json.

Two sets, both from the app's ACTUAL vocabulary (public/mandarin-source.json):

  single  — one-syllable app cards, each an isolated Tone Perfect recording
            (citation form: exactly what a learner says for a 1-syllable card).
            This is the case the app has been HEDGING on — deriveAutoRating
            never auto-fails a single-syllable miss "because recognizers trip on
            lone syllables." This measures whether that hedge is justified.

  multi   — two-syllable non-neutral app cards, built by concatenating the two
            component Tone Perfect syllables from the SAME speaker with a short
            gap. Real native phonation, citation style (how a careful beginner
            says a two-syllable word). NOT natural fast coarticulation — labeled
            as such. Lets us contrast single- vs multi-syllable recovery on the
            same voices and vocabulary.

Data: Tone Perfect (isolated citation syllables, 6 speakers, NON-COMMERCIAL —
eval-only; see eval/README.md). Every Mandarin syllable*tone*speaker is present,
so any app word of 1-2 non-neutral syllables can be built from real recordings.

  python eval/eval_word_recognition.py [single_budget] [multi_budget]
"""

from __future__ import annotations

import json
import os
import random
import re
import sys
import time

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
from app.audio_decode import decode_to_mono  # noqa: E402

from faster_whisper import WhisperModel  # noqa: E402
from pypinyin import Style, lazy_pinyin  # noqa: E402

HERE = os.path.dirname(__file__)
MP3_DIR = os.path.join(HERE, "data", "tone_perfect")
CORPUS = os.path.join(HERE, "..", "public", "mandarin-source.json")
OUT = os.path.join(HERE, "scorecards", "word_recognition.json")
SPEAKERS = ["FV1", "FV2", "FV3", "MV1", "MV2", "MV3"]
SR = 16_000
GAP = np.zeros(int(0.15 * SR), dtype=np.float32)  # 150 ms between concatenated syllables
NAME = re.compile(r"^([a-zü:v]+)([1-4])_([FM]V[123])_")


def toneless(pinyin_syllable: str) -> str:
    """A pinyin syllable with the tone number and ü-encoding normalized away, so
    'lü2', 'lv2', 'lu:2' and 'lu2' all compare on their sound."""
    s = pinyin_syllable.strip().lower()
    s = s.replace("u:", "v").replace("ü", "v")
    return re.sub(r"[1-5]$", "", s)


def token(pinyin_syllable: str) -> str | None:
    """Tone Perfect filename token (syllable+tone, ü as v), or None if not 1-4."""
    s = pinyin_syllable.strip().lower().replace("u:", "v").replace("ü", "v")
    m = re.match(r"^([a-zv]+)([1-4])$", s)
    return (m.group(1) + m.group(2)) if m else None


def whisper_syllables(model: WhisperModel, audio: np.ndarray) -> list[str]:
    segments, _ = model.transcribe(audio, language="zh", beam_size=1)
    text = "".join(s.text for s in segments)
    return [toneless(p) for p in lazy_pinyin(text, style=Style.TONE3, errors="ignore")]


def clip_path(tok: str, speaker: str) -> str:
    return os.path.join(MP3_DIR, f"{tok}_{speaker}_MP3.mp3")


def load_clip(tok: str, speaker: str) -> np.ndarray | None:
    path = clip_path(tok, speaker)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as fh:
        samples, _ = decode_to_mono(fh.read(), SR)
    return samples if samples.size >= 400 else None


def seq_error_rate(gold: list[str], pred: list[str]) -> float:
    """Levenshtein over syllable sequences / len(gold) — a by-sound analogue of
    CER (hanzi CER is meaningless here: one syllable maps to many homophones)."""
    n, m = len(gold), len(pred)
    if n == 0:
        return 0.0 if m == 0 else 1.0
    dp = list(range(m + 1))
    for i in range(1, n + 1):
        prev, dp[0] = dp[0], i
        for j in range(1, m + 1):
            cur = dp[j]
            dp[j] = min(dp[j] + 1, dp[j - 1] + 1, prev + (gold[i - 1] != pred[j - 1]))
            prev = cur
    return dp[m] / n


def build_cards() -> tuple[list[dict], list[dict]]:
    data = json.load(open(CORPUS, encoding="utf-8"))
    cards = data.get("cards", data)
    single, multi = [], []
    for c in cards:
        py = (c.get("pinyin") or "").strip()
        if not py:
            continue
        sylls = py.split()
        toks = [token(s) for s in sylls]
        if any(t is None for t in toks):
            continue  # a neutral-tone or unparseable syllable — not in Tone Perfect
        if len(sylls) == 1:
            single.append({"zh": c["answerZh"], "toks": toks, "gold": [toneless(sylls[0])]})
        elif len(sylls) == 2:
            multi.append({"zh": c["answerZh"], "toks": toks, "gold": [toneless(s) for s in sylls]})
    return single, multi


def write(scorecard: dict) -> None:
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(scorecard, f, indent=2, ensure_ascii=False)


def main() -> None:
    single_budget = int(sys.argv[1]) if len(sys.argv) > 1 else 900
    multi_budget = int(sys.argv[2]) if len(sys.argv) > 2 else 500
    rng = random.Random(0)

    single_cards, multi_cards = build_cards()
    rng.shuffle(single_cards)
    rng.shuffle(multi_cards)
    single_cards = single_cards[:single_budget]
    multi_cards = multi_cards[:multi_budget]
    print(f"single buildable sampled: {len(single_cards)} | multi: {len(multi_cards)}", flush=True)

    model = WhisperModel("base", device="cpu", compute_type="int8")
    scorecard: dict = {
        "note": "Production whisper (base/int8/cpu, zh, beam 1) on REAL native audio, scored BY SOUND (toneless pinyin) as the app does.",
        "data": "Tone Perfect isolated citation syllables (non-commercial, eval-only). Multi = two real syllables concatenated (citation style, not natural coarticulation).",
        "single": None,
        "multi": None,
    }

    # --- single syllable --------------------------------------------------------
    t0 = time.monotonic()  # monotonic: a wall-clock jump (sleep) must not corrupt timing
    s_ok = s_total = 0
    s_extra = 0  # whisper heard >1 syllable for a lone syllable (over-segmentation)
    s_by_speaker = {sp: [0, 0] for sp in SPEAKERS}
    for i, card in enumerate(single_cards):
        speaker = SPEAKERS[i % len(SPEAKERS)]
        audio = load_clip(card["toks"][0], speaker)
        if audio is None:
            continue
        heard = whisper_syllables(model, audio)
        ok = card["gold"][0] in heard
        s_ok += ok
        s_total += 1
        s_extra += len(heard) > 1
        s_by_speaker[speaker][0] += ok
        s_by_speaker[speaker][1] += 1
        if (i + 1) % 100 == 0:
            rate = s_ok / s_total if s_total else 0
            print(f"  single {i+1}/{len(single_cards)}  recovery={rate:.3f}  ({time.monotonic()-t0:.0f}s)", flush=True)
            scorecard["single"] = {"n": s_total, "recovery": round(s_ok / s_total, 4), "partial": True}
            write(scorecard)
    scorecard["single"] = {
        "n": s_total,
        "recovery": round(s_ok / s_total, 4) if s_total else None,
        "over_segmented_rate": round(s_extra / s_total, 4) if s_total else None,
        "by_speaker": {sp: round(v[0] / v[1], 3) for sp, v in s_by_speaker.items() if v[1]},
    }
    write(scorecard)
    print(f"SINGLE recovery {s_ok}/{s_total} = {s_ok/max(1,s_total):.1%}", flush=True)

    # --- multi syllable (two real syllables concatenated) -----------------------
    t1 = time.monotonic()
    m_full = m_syl_ok = m_syl_total = m_total = 0
    m_ser = 0.0
    for i, card in enumerate(multi_cards):
        speaker = SPEAKERS[i % len(SPEAKERS)]
        a = load_clip(card["toks"][0], speaker)
        b = load_clip(card["toks"][1], speaker)
        if a is None or b is None:
            continue
        audio = np.concatenate([a, GAP, b]).astype(np.float32)
        heard = whisper_syllables(model, audio)
        gold = card["gold"]
        # full recovery: both gold syllables present in order (subsequence match)
        full = _ordered_subseq(gold, heard)
        per = sum(1 for g in gold if g in heard)
        m_full += full
        m_syl_ok += per
        m_syl_total += len(gold)
        m_ser += seq_error_rate(gold, heard)
        m_total += 1
        if (i + 1) % 100 == 0:
            print(f"  multi {i+1}/{len(multi_cards)}  full={m_full/m_total:.3f} ({time.monotonic()-t1:.0f}s)", flush=True)
            scorecard["multi"] = {"n": m_total, "full_word_recovery": round(m_full / m_total, 4), "partial": True}
            write(scorecard)
    scorecard["multi"] = {
        "n": m_total,
        "full_word_recovery": round(m_full / m_total, 4) if m_total else None,
        "per_syllable_recovery": round(m_syl_ok / m_syl_total, 4) if m_syl_total else None,
        "syllable_error_rate": round(m_ser / m_total, 4) if m_total else None,
    }
    write(scorecard)
    print(f"MULTI full-word {m_full}/{m_total} = {m_full/max(1,m_total):.1%} | per-syllable {m_syl_ok/max(1,m_syl_total):.1%} | SER {m_ser/max(1,m_total):.3f}", flush=True)
    print(f"scorecard -> {OUT}", flush=True)


def _ordered_subseq(gold: list[str], heard: list[str]) -> bool:
    it = iter(heard)
    return all(g in it for g in gold)


if __name__ == "__main__":
    main()
