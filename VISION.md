# Mandarin Practice — Vision & Direction

The durable "why and where" for this app, so the direction never has to be
re-explained. Read this before making architectural changes. Tickets and plans
are checked against *this* and against the actual code — not the other way
around. When a claim here and the code disagree, the code wins and this file gets
corrected with a dated note.

## What the app is

A browser tool for practicing Mandarin: call-and-response cards, spaced
repetition, listening drills, character writing, and tone/pronunciation feedback.
Svelte 5 + Vite + TypeScript. Local-first: everything runs in the browser and
progress lives in `localStorage`, with optional encrypted sync across devices.

The bar (Ethan, 2026-07-16): **a stranger would genuinely choose to learn Chinese
with it** — "Duolingo + HelloChinese + Preply level good." Someday extracted from
its monorepo into its own thing, so the learning core stays self-contained.

## The 2026-08-19 rethink (current direction — start here)

Ethan called for a total rethink of three things. This is the standing direction:

1. **Prebuilt, stored audio — no on-the-fly synthesis.** Generating audio in the
   browser (the Kokoro neural model over onnxruntime-web, or live speech
   synthesis) is **too slow**. Audio is now **pre-generated once, offline, and
   stored on a real object store**, and the app just plays a URL. This is the top
   priority — it's the thing that made the app feel slow.

2. **Selection before a session.** You pick what to practice — **HSK level**,
   **unit/theme**, or a dedicated **Preply track** — instead of drilling one flat
   2,200-card pile. The Preply track is a review of Ethan's real tutor lessons
   (2–3/week; a PDF per lesson, downloaded manually — automation was tried and
   abandoned, don't retry it).

3. **Pronunciation that actually runs.** Today's tone/pronunciation feedback
   leans on the browser Web Speech API, which is missing in many browsers and
   **silently no-ops** — so it reads as "not implemented." The rebuild scores your
   spoken **pitch contour against the native reference clip** we now have from the
   prebuilt audio. Deterministic, works in every browser, honest. Word-level
   recognition ("did you say the right word") is spec'd as the next push, not this
   one (see Roadmap).

### Storage decision record (2026-08-19)

Chosen: **Cloudflare R2**, served through the existing Worker. Rationale:

- The whole audio library is tiny — **under ~1 GB even at full ambition** (HSK
  1–6 + example sentences + Preply, multi-voice); the current corpus is ~100 MB.
  At this scale storage cost is a rounding error anywhere.
- R2 is **$0 and genuinely fixed**: under the 10 GB free tier, and egress is
  always free by design — no surprise-bill surface (the thing Ethan asked to
  avoid). It speaks the **S3 API**, so it is not lock-in; real S3 remains one
  endpoint change away.
- Audio is served via a cached route on the **existing `mandarin-backend`
  Worker** (`GET /v1/audio/:key`), not the r2.dev public URL (whose managed-domain
  API was erroring for this account). One origin, CORS + cache control in code,
  entirely within the access we already have.

Considered and rejected: **AWS S3** (egress not free; pulls off the Cloudflare
stack; only pennies/month but not fixed) and **shipping audio as static files in
the deploy** (bloats the repo/bundle; no real object store).

Bucket: `mandarin-audio` (account `bf81993449…`). Upload via `wrangler r2 object
put` with the existing OAuth token — no separate S3 credentials needed.

## How the pieces connect

```
(root)      the Svelte practice app (SRS, listening, tone, writing, selection)
backend/    the Cloudflare Worker: encrypted sync + Character subgraph + audio serving
factory/    the Python pipeline: tutor-PDF → cards, and offline audio generation
```

- **Content** (cards, units, decks, per-card `audioUrl` and tone contour) is
  static JSON — `public/mandarin-source.json` — built by the factory + HSK
  scripts, shipped with the app. Fast, offline, permanent in git and the deploy.
  Selection runs **client-side** over this; no content database is needed.
- **Audio** is prebuilt MP3s in **R2**, referenced by a stable per-card URL.
- **Progress** stays as-is: local-first, with optional client-encrypted sync on
  the Worker + KV (see "The backend").

**The factory feeds the app.** `factory/` turns tutor lesson PDFs into cards and
generates audio. The HSK 1–3 deck comes from `scripts/build-hsk-corpus.mjs`
(Complete HSK Vocabulary dataset). The Preply track comes from the factory
(`ingest → extract → author cards → validate → export`). A **merge** step (never a
bare `export`, which overwrites the HSK corpus) combines them into one
`mandarin-source.json` with each as its own unit; an **audio** step then
generates clips, uploads them to R2, and injects `audioUrl` + contour into every
card.

```
tutor PDF ─┐
           ├─ factory ─→ merge ─→ audio-gen (R2) ─→ public/mandarin-source.json ─→ app
HSK dataset ┘
```

## Pronunciation — how the rebuild works

- **Now (tone contour vs. native reference).** Each prebuilt reference clip's
  pitch contour is extracted offline and shipped with the card. At runtime the
  app records your mic, extracts your pitch contour in-browser (reusing the
  autocorrelation pitch detector already in `mandarinToneAssessment.ts`), aligns
  it to the reference per syllable, and scores tone shape. This replaces scoring
  against *idealized* tone shapes with scoring against a real spoken reference.
  Feedback stays honest and hedged: guidance, not a grade; your self-rating is
  still the primary signal.
- **Next (word recognition), spec'd not built.** To check you said the *right
  word*, run **Whisper-tiny in-browser via `onnxruntime-web`** — already a
  dependency — lazy-loaded only when you enter pronunciation mode. $0, private, no
  server, no per-card cost. Fallback if that proves too heavy on phones: a tiny
  `whisper.cpp` endpoint on the existing Lightsail box ($0 marginal). Kept off the
  hot path either way; tone-contour feedback is the always-on signal.

## The backend

A single small Cloudflare Worker (`backend/`, TypeScript, free tier, ~$0) with
three jobs:

### Job 1 — Encrypted progress sync
Practice on a laptop, continue on a phone, with **no accounts**. The client is
authoritative; the server is a dumb blob store. The progress snapshot is
encrypted in the browser (WebCrypto AES-GCM, key from PBKDF2) before it leaves the
device — the server stores an opaque blob it can't read. Identity is a
high-entropy **sync code** (bearer secret) that derives a non-secret blob id and
the encryption key by domain-separated hashing. Devices reconcile by a field-aware
merge (per-card: keep the more-progressed state; days: union; counts: max), never
a clobber. Transport: plain REST (`/v1/blob/:id`). *Live at
`https://mandarin-backend.ethanadams.workers.dev`.*

### Job 2 — Audio serving (2026-08-19)
`GET /v1/audio/:key` streams a prebuilt clip from the `mandarin-audio` R2 bucket
with long `Cache-Control` and permissive CORS, edge-cached so repeat plays don't
re-read R2. This is the app's audio origin.

### Job 3 — The `Character` subgraph (federation)
A typed, read-only, corpus-derived graph at `/graphql` (no user data, no
database). Exposes `Character` (`@key(fields: "hanzi")`) and HSK stats, ready to
federate into a portfolio supergraph beside Draw and Loupe. Progress stays
encrypted and private — deliberately *not* in the graph.

## Later threads (real, but after the rethink lands)

- **Writing practice** (draw characters, score stroke order via hanzi-writer /
  Make Me a Hanzi). A `WritingPractice` component exists; the reusable ink-capture
  concept mirrors the Draw app (`../liveboard`).
- **Federation.** `Character` becomes a shared entity Mandarin owns and Draw
  references, so a portfolio homepage runs one supergraph query across Draw,
  Loupe, and Mandarin.

## Roadmap (in order; each step ships value on its own)

1. **Prebuilt stored audio** — offline generation, R2 upload, Worker serving,
   per-card `audioUrl`; retire in-browser Kokoro/onnxruntime synthesis. *In
   progress (this rethink).*
2. **Preply track** — ingest the ~29 tutor-lesson PDFs, author cards, merge as a
   distinct unit. *In progress (this rethink).*
3. **Selection screen** — pick HSK level / unit / Preply track before a session.
   *In progress (this rethink).*
4. **Pronunciation v1** — tone contour vs. native reference. *In progress (this
   rethink).*
5. **Pronunciation v2** — in-browser Whisper word recognition. *Next.*
6. **Writing-practice + federation** threads. *Later.*

## Guardrails

- **No monthly costs.** Free tiers and local compute only. R2 (under free tier)
  and the Cloudflare Worker are the deliberate, justified $0 exceptions.
- **Local-first stays sacred.** The client is always the source of truth; the app
  must keep working fully offline. Audio degrades to the browser voice when the
  network or a clip is unavailable; it must never hard-fail to silence without
  saying so.
- **Privacy stays sacred.** Progress is encrypted client-side; the server never
  sees plaintext or PII.
- **Honest feedback.** Unvalidated metrics are shown as experimental and hedged;
  manual self-rating stays primary. No fake polish, no shipping unvalidated
  feedback to look done.

## Correction log

- **2026-08-19:** A prior VISION claimed "prebuilt audio DONE" and that HSK cards
  shipped with self-hosted audio. Untrue — `public/` shipped **zero** audio files
  and every card synthesized on the fly (browser voice or in-browser Kokoro). The
  2026-08-19 rethink makes prebuilt stored audio actually real. Tone/pronunciation
  was likewise not a working engine (it silently no-oped when the browser lacked
  the Web Speech API); the contour-vs-reference rebuild replaces it.
