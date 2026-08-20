# Rethink brief — start here (2026-08-20)

Ethan wants a **fundamental rethink of the whole tool now that there's a real
cloud backend** (Lightsail box + Cloudflare Worker + R2). The current app has
tons of baked-in setup and assumptions — **question all of them; don't preserve
any by default.** The next session should rewrite VISION.md around the answers,
not extend the old one.

## Decision already made
- **Word recognition: NOT on-device.** The opt-in ~230 MB in-browser Whisper that
  currently ships (`src/lib/utils/mandarinWhisper.ts`, `@huggingface/transformers`
  + `opencc-js`) is to be **replaced by server-side transcription on the Lightsail
  box**: browser uploads a ~30 KB clip → `whisper.cpp`/faster-whisper → text.
  Audio leaving the device is acceptable to Ethan. Rip out the on-device path once
  the endpoint works.

## Assumptions to question (all baked in today)
- **Local-first / "client is always the source of truth"** (current VISION
  guardrail): with a real server, do **accounts + server-owned state** make more
  sense now?
- **No accounts / sync-code-only** progress.
- **Content as static JSON shipped with the app** (`public/mandarin-source.json`,
  3,222 cards) — move to a **server/DB**, generated/served on demand?
- **Prebuilt-everything + $0/free-tier-only**: the Lightsail box is a real,
  already-paid server. Use it for **on-demand compute** (transcription, audio,
  card generation, grading) instead of pre-baking + free tiers everywhere?
- **The Python "factory" pipeline + manual Preply PDF drops** as the content path.
- **Two backends** (Cloudflare Worker: sync/audio/graphql, on free tier) **vs.
  consolidating on Lightsail** — one backend or two?

## Current shipped state (branch `rethink-audio-selection`, pushed)
- **Audio**: prebuilt clips in R2, served via Worker `GET /v1/audio/:key`; 3,222
  cards (HSK 1–3 + 29 Preply lessons) each carry `audioUrl`. In-browser Kokoro
  retired (bundle 24 MB → 178 KB).
- **Selection**: "Practice all" per HSK level / Preply track + per-lesson.
- **Pronunciation**: contour-vs-native (works everywhere, no download) + the
  opt-in on-device Whisper word check **(to be replaced, see above)**.
- **Backend**: one Cloudflare Worker = encrypted progress sync (KV) + audio (R2) +
  `Character` graphql. Lightsail box exists (runs CCP Signal) — candidate host for
  Whisper and more.
- 185 tests green; VISION.md is the (soon-to-be-rewritten) canonical direction.

## First concrete step
Stand up a small server-side transcription endpoint on Lightsail; wire the tone
coach to upload the recording instead of loading a model; then remove
`mandarinWhisper.ts` and the transformers.js/opencc deps.
