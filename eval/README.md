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
- **Tone Perfect** (MSU, `tone.lib.msu.edu`) — isolated monosyllables, every
  tone×syllable by 6 speakers. Cleaner isolated-syllable signal, but
  **non-commercial** and gated behind a click-through, so it is an OPTIONAL
  supplementary eval only — never a training source for shipped weights, never on
  the critical path.

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
- **C. Word eval + fix** the single-syllable weakness.
- **D. Only then** return to UX/content.

## Known scaling limit (named, not ignored)

faster-whisper `base` on the 2 GB box borrows ~400 MB/request and will not survive
real concurrency. Fine at zero users; a real user base needs a smaller/quantized
model or a queue. The tone classifier is a matmul — negligible.
