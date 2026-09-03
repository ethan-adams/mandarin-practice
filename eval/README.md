# eval/ — the ground-truth quality layer

**Why this exists.** For months the assessment core (tone, word recognition) has
been judged by "does it run + pass unit tests + look right in a screenshot." None
of those measure *is it actually good*, so every version shipped at "80%", reality
broke it, and we rebuilt. Tone alone has been rebuilt ~4 times. This directory is
the missing layer: **real human recordings with ground-truth labels, scored by the
real assessment code, emitting a number and a regression gate.** No human in the
loop — the agent iterates against these numbers.

Decided 2026-08-29 (Ethan): **assessment engine first** (accuracy is the
differentiator) and **eval-first** (no quality feature ships without a measured
gate).

## Data (autonomous, permissively licensed)

- **AISHELL-3** (`openslr.org/93`, **Apache 2.0**) — 218 native speakers, 88k
  utterances, **pinyin-level tone labels** (>98% label accuracy). This is the
  PRIMARY source for both eval and any trained weights. Apache means no
  licensing landmine on a model we ship. Gitignored cache under `eval/data/`.
- Ground-truth syllable segments are cut from each utterance using the **same
  whisper word-timings the product uses in production** (`server/app`), so the
  eval measures the real pipeline, not a lab proxy, and yields isolated
  `(syllable-audio, gold-tone)` pairs for both scoring and training.
- **Tone Perfect** (MSU) — 9,840 isolated monosyllables, every tone×syllable by 6
  native speakers, filename-labeled (`a1_FV1_MP3.mp3` = syllable, tone, speaker).
  This is the PRIMARY tone data (train + eval), because it matches the app's real
  domain — users say **isolated words**, not sentences. FLEURS/AISHELL are connected
  speech, whose coarticulation flattens tones and trains poorly (0.29–0.36 balanced);
  Tone Perfect trains to **91.8% cross-voice** (leave-one-speaker-out). Obtained
  from a public GitHub mirror (`tayburke/Learning-Tones`) into the gitignored
  `eval/data/tone_perfect/`.
  **License: NON-COMMERCIAL.** Fine for this free, non-commercial personal app. If
  the app is ever monetized, the tone model must be retrained on permissively
  licensed isolated-syllable data (or Tone Perfect licensed for commercial use).

## Split discipline

Train and eval are **speaker-disjoint** (hold out whole speakers), because the
failure mode that has bitten us is *cross-voice generalization* — a threshold
tuned on one voice failing on the next. Measuring on held-out speakers is the
only honest test of that.

## Metrics (the scorecard)

Per run, `eval/scorecards/<name>.json` records:

- **Tone confusion matrix** (gold tone 1-4/neutral × predicted), overall accuracy,
  per-tone precision/recall.
- The two numbers the app actually acts on: **correct-tone accepted** rate and
  **wrong-tone rejected** rate (feed a real tone-3 clip to a tone-1 card → must
  reject). This is buildable from AISHELL-3's cross-tone syllable pairs.
- Word recognition (later): CER on held-out utterances, single- vs multi-syllable
  broken out (the case we have been hedging).

A committed scorecard is the **baseline**; a run that regresses below it fails the
gate. Feature work does not resume until the core is green.

## Sequence

- **A. Eval foundation** — this harness + the first real number for today's engine.
- **B. Tone model** — if hand-tuned DSP can't clear the bar (expected — thresholds
  don't generalize across voices), train a small classifier on the contour
  features and **export to pure-numpy inference** (weights committed, tiny), so the
  box stays $0 and torch-free. A trained absolute-tone classifier also removes the
  per-card native-reference dependency, which does not scale to new content.
- **C. Word eval + fix** the single-syllable weakness. **Done — see below.**
- **D. Only then** return to UX/content.

## Phase C — word recognition (the number)

`eval/eval_word_recognition.py` runs the **production whisper** (base / int8 /
cpu, `language=zh`, `beam_size=1`) over **real native audio** and scores it the
way the app scores a word: **by sound** (toneless pinyin), so a homophone counts
as correct (the app's `compareBySound` rule). Both sets are the app's ACTUAL
vocabulary (`public/mandarin-source.json`); the audio is Tone Perfect isolated
citation syllables (the same eval-only, non-commercial source as the tone model).

Scorecard: `eval/scorecards/word_recognition.json`.

| set | how the audio is built | n | recovery |
| --- | --- | --- | --- |
| **single-syllable** | one real Tone Perfect clip (citation form — exactly what a learner says for a 1-syllable card) | 739 | **40.9%** by-sound |
| **multi-syllable (2)** | the two component syllables, real recordings from the same speaker, concatenated with a 150 ms gap (citation style, NOT natural coarticulation) | 500 | **64.8%** full-word / **75.4%** per-syllable (SER 0.31) |

**What it proves.** Whisper recovers a **lone** citation syllable's sound **less
than half the time** (40.9%, steady 32–45% across all six speakers; it also
over-segments a single syllable into two 16% of the time). A two-syllable word,
where the second syllable gives the recognizer context, is much better. This is
the recognizer's own floor on clean native audio — a real learner's mic can only
be worse. The floor is **intrinsic**, not a tuning miss: an ablation on a 120-clip
sample moved `beam_size` 1→5 for only +1.7 pts (42.5%→44.2%, within noise) at a
real latency cost on the 2 GB box, and a neutral Mandarin `initial_prompt` made it
*worse* (39.2%). There is no cheap knob; a lone syllable simply lacks the context
whisper needs.

**So the app's existing hedge is correct, now with a number behind it.**
`deriveAutoRating` already refuses to auto-fail a *single-syllable* miss ("read-back
is unreliable on a lone syllable") and only fails a *multi-syllable* miss. The
40.9% vs 64.8% gap is exactly that policy, measured — a single-syllable "miss" is
far more likely a recognizer failure than a learner error, so it must not grade
the card. Keep it. Because whisper alone can't confirm a single-syllable card,
that case must lean on **tone** for its signal — which is why re-enabling tone in
scheduling (Sequence step after this) matters most for one-syllable cards.

**Caveats, stated.** (1) The multi set is concatenated citation syllables, not
natural connected speech — natural coarticulation would likely *raise* multi-syllable
recovery, so 64.8% is a conservative floor, not the ceiling. A natural-connected-speech
word eval needs **AISHELL-3** (Apache, permissive) audio, not yet downloaded — the
honest next data step rather than inventing a number. (2) Scored by sound (toneless),
matching the app; a tone error is caught by the tone engine, not here.

## Known scaling limit (named, not ignored)

faster-whisper `base` on the 2 GB box borrows ~400 MB/request and will not survive
real concurrency. Fine at zero users; a real user base needs a smaller/quantized
model or a queue. The tone classifier is a matmul — negligible.
