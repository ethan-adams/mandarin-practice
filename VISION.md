# Mandarin Practice — Vision & Direction

The durable "why and where" for this app, so the direction never has to be
re-explained. Read this before making architectural changes. Tickets and plans are
checked against *this* and against the actual code — not the other way around. When
a claim here and the code disagree, the code wins and this file gets corrected with
a dated note.

## What the app is

A browser tool for practicing Mandarin: call-and-response cards, spaced repetition,
listening drills, character writing, and tone/pronunciation feedback. Svelte 5 +
Vite + TypeScript on the front end.

The bar (Ethan, 2026-07-16): **a stranger would genuinely choose to learn Chinese
with it** — "Duolingo + HelloChinese + Preply level good." It stays its own
standalone repo so the learning core is self-contained.

## The 2026-08-20 pivot — server-owned (current direction, start here)

Now that there's a **real, already-paid server** (the Lightsail box), the app stops
pretending it has to do everything in the browser for free. Ethan flipped two
things this VISION previously treated as sacred:

1. **Accounts + server-owned state.** There are now real accounts, and the
   **server owns progress** (and content). This replaces the old "local-first, the
   client is always the source of truth, no accounts, sync-code-only" model. Cross
   device, richer features, and honest data ownership beat the no-accounts
   ergonomics.

2. **Content lives in a server DB.** The 3,222 cards move from the static
   `public/mandarin-source.json` (fetched in `deck.ts`) into a **Postgres DB served
   on demand** by a content API. The JSON stays in the repo only as a **seed +
   offline fallback**, not the canonical store.

3. **Pronunciation word-check runs server-side.** The opt-in ~230 MB on-device
   Whisper (`mandarinWhisper.ts` + `@huggingface/transformers` + `opencc-js`) is
   **replaced by transcription on the box**: the browser uploads a ~30 KB clip →
   faster-whisper → text. Audio leaving the device is acceptable to Ethan. The
   always-on tone-contour signal (below) stays fully client-side and needs no
   upload.

### The box (verified via AWS, 2026-08-20)

`portfolio-backend` — Lightsail Ubuntu, **2 vCPU / 2 GB RAM / 60 GB disk**
(`small_3_0`, ~$10/mo, already paid), us-east-1. Runs CCP Signal via docker-compose
(Postgres + Qdrant). **CPU sits at ~3%** — enormous compute headroom; the only
scarce resource is the 2 GB RAM. This is affordable because:

- **Content + accounts + progress are RAM rounding-error** — a few MB in Postgres.
  We **reuse the existing Postgres** (a separate `mandarin` database), not a second
  DB engine.
- **Whisper is the only real cost**, and it's controllable: run the `base` model
  **lazily / per-request** so it borrows ~400 MB for a ~2-second burst on CPU
  that's 97% idle, rather than holding a warm worker. A **2 GB swapfile** on the 60
  GB disk is the safety net; the model size is env-configurable and degrades to
  `tiny` if RAM is ever tight.
- Scaling caveat: CPU Whisper is fine for Ethan + early users. Many *strangers*
  transcribing at once would need a rethink (batching, a queue, or GPU) — a
  good-problem-later, logged not solved.

## Product experience — the 2026-08-20 redesign direction

A full product rework (in progress). The design language is **"Ink & Jade"**,
built into Ethan's own **`ea-design`** system: green-biased rice-paper neutrals,
**jade** as the calm learning-first primary, a **cinnabar seal (印章)** as the one
bold accent, and type = Schibsted Grotesk / Hanken Grotesk / **Noto Sans SC** for
hanzi. "HelloChinese-calm, but ours."

Ethan's model, decided 2026-08-20 (these override older SRS/gamified assumptions):

- **Explore as you go — no due dates.** No review-queue "34 due today" chore. You
  move through content at your pace; adaptive scheduling still runs *under the
  hood* and quietly resurfaces weak items, but is never surfaced as due-date guilt.
- **The app judges you — no manual Again/Good/Easy.** Scoring is automatic from
  actual performance (tone contour + word recognition + recall), not self-rating.
- **Motivation through culture & history, not gamification.** No points/streak
  worship. Instead: **character evolution** (oracle-bone → seal → modern, the way
  his tutor shows it) with etymology/component breakdown, and **cultural festivals**
  surfaced in season. Streaks stay minor at most.
- **Drawing is first-class, especially on touch.** The existing `WritingPractice`
  (hanzi-writer, 955 chars of stroke data in `public/hanzi/`) gets surfaced as a
  trace/quiz step — currently built but not wired into navigation.
- **Surfaces:** Explore (home) · Session (speak → auto-score → trace → next) ·
  Journey (progress, characters met, stories read) · Character Story (evolution +
  etymology) · You (account/settings).
- **Platform:** ship a **mobile-first responsive web** app now (Svelte). A native
  **React Native** app is a *later* possibility, not the current goal — but the
  server-owned API and portable `ea-design` tokens are built so RN could reuse
  them. RN would be a React rewrite; that decision is deferred.

*Data status (2026-08-22):* component etymology, radical, meaning, and stroke
order all ship now, from Make Me a Hanzi's dictionary (self-hosted in
`public/hanzi-dict.json`, $0/local — same pattern as the stroke graphics). True
ancient-form glyphs (oracle/seal) stay **deferred**: no free, well-licensed,
well-covered dataset was found (hanziyuan / Wikimedia coverage + licensing
unresolved). The Character Story ships on the derivable data; the
oracle→seal→modern *evolution* view waits on a source. Prototypes (pitch +
clickable app) exist as artifacts.

## How the pieces connect

```
Svelte app ──┬─→ mandarin-api on Lightsail  (content, accounts, progress, transcription)
             └─→ Cloudflare Worker + R2      (audio clips: GET /v1/audio/:key)
```

- **mandarin-api** (new, `server/`): **FastAPI** on the box — chosen to match the
  box's Python tooling and the Whisper bindings. SQLAlchemy/asyncpg over the reused
  Postgres. Deployed as another docker-compose service beside CCP Signal.
- **Cloudflare Worker + R2 stays** for audio serving only (`/v1/audio/:key`, $0,
  edge-cached, works). Its **encrypted-sync `/v1/blob` route is retired** once
  server-owned progress lands. The `Character` GraphQL subgraph can stay on the
  Worker for now; its final home is a later call.
- **factory/** (Python pipeline) still turns tutor-lesson PDFs into cards and
  generates audio offline; its output now **seeds the DB** instead of shipping as
  the live content file.

## Auth & data

- **Accounts:** email + password, hashed with **argon2id**; signed session tokens
  (httponly cookie or bearer). Magic-link is a possible later upgrade.
- **Progress:** server-owned, keyed to the account (per-card SRS state, day
  streaks, counts). The client caches locally for responsiveness but the server is
  authoritative — the reverse of the old model.
- **Audio for transcription:** uploaded, transcribed, **discarded** — not stored.

## Pronunciation

- **Tone contour vs. native reference (always on, client-side).** Each prebuilt
  reference clip's pitch contour ships with the card (`public/mandarin-contours.json`,
  scored in `mandarinToneReference.ts`). At runtime the app records the mic,
  extracts the learner's contour in-browser, aligns per syllable, and scores tone
  shape. Works in every browser, no upload, no download. Feedback stays honest and
  hedged — guidance, not a grade; self-rating stays primary.
- **Word recognition (server-side).** `POST /v1/transcribe` on mandarin-api runs
  faster-whisper over the uploaded clip; the existing `comparePronunciation`
  alignment marks the characters. Replaces the on-device Whisper path entirely.

## Later threads

- **Writing practice** — draw characters, score stroke order (hanzi-writer / Make
  Me a Hanzi). A `WritingPractice` component exists.
- **Federation** — `Character` as a shared entity Mandarin owns and Draw
  references, so a portfolio homepage runs one supergraph query across Draw, Loupe,
  and Mandarin.

## Roadmap (in order; each step ships value on its own)

Detailed plan in `docs/BUILD-PLAN.md`. Headline sequence:

0. **Box access + service skeleton** — SSH/deploy access; `server/` FastAPI
   skeleton; docker-compose service on the box; reuse Postgres (`mandarin` DB);
   health endpoint; 2 GB swapfile. *Scaffold buildable now; deploy blocked on SSH.*
1. **Content API** — seed 3,222 cards into Postgres; `GET /v1/content`; app
   `deck.ts` fetches from the API with the JSON as cached fallback.
2. **Transcription endpoint** — `POST /v1/transcribe`; wire the tone coach to
   upload; remove `mandarinWhisper.ts` + transformers.js/opencc.
3. **Accounts + server progress** — auth; progress tables; app login + server
   progress; retire encrypted-sync `/v1/blob`.
4. **Cleanup / federation** — decide the `Character` subgraph home; tidy the
   Worker down to audio-only.

## Guardrails

- **No *new* monthly costs.** Reuse the already-paid Lightsail box, reuse its
  Postgres, keep audio on the R2 free tier. No new paid services without explicit
  justification to Ethan first.
- **Honest feedback stays sacred.** Unvalidated metrics are shown as experimental
  and hedged; manual self-rating stays primary. No fake polish.
- **Be honest about data.** Accounts and server-owned progress mean the server now
  holds real user data; uploaded audio is transcribed then discarded. Tell users
  plainly what leaves the device. No third-party data sale, ever.
- **Degrade, don't lie.** If content or audio can't load, say so; never hard-fail
  to silence or a blank screen without explanation.

## Correction log

- **2026-08-20:** Full pivot. This VISION previously made **local-first, no
  accounts, client-as-source-of-truth, client-side-encrypted privacy, and
  static-JSON content** load-bearing guardrails. Ethan retired all of them in favor
  of accounts + server-owned state + server DB content + server transcription on the
  existing Lightsail box. The old prebuilt-audio (R2) and tone-contour work carry
  forward; the encrypted-sync path and on-device Whisper are on the way out.
- **2026-08-19:** A prior VISION claimed "prebuilt audio DONE" — untrue at the time;
  the 2026-08-19 rethink made prebuilt R2 audio and contour-vs-reference
  pronunciation actually real (both carried forward here).
