# Build plan — server-owned pivot (2026-08-20)

Actionable sequence for the pivot in `VISION.md`. Each phase ships value on its
own. **Legend:** 🟢 buildable + testable locally now · 🔴 needs the box (blocked on
SSH access).

## Target shape

```
Svelte app ──┬─→ mandarin-api (FastAPI, Lightsail portfolio-backend)
             │      /v1/content     seed'd from mandarin-source.json → Postgres
             │      /v1/transcribe  faster-whisper (base, lazy, per-request)
             │      /v1/auth/*      argon2id email+password, session tokens
             │      /v1/progress    server-owned SRS state, per account
             └─→ Cloudflare Worker + R2   /v1/audio/:key  (unchanged)
```

- Reuse the box's existing **Postgres** (new `mandarin` database), not a 2nd DB.
- New service `server/` deployed as a docker-compose service beside CCP Signal.
- 2 GB swapfile on the box as the Whisper RAM safety net.

## Phase 0 — service skeleton + box access

- 🟢 `server/` FastAPI app: `GET /health` → `{"status":"ok"}`; config via env
  (`DATABASE_URL`, `WHISPER_MODEL=base`, `SESSION_SECRET`); Dockerfile;
  `docker-compose` fragment; pytest smoke test; local run against a local Postgres.
- 🔴 On the box: create `mandarin` DB in the existing Postgres; add the
  `mandarin-api` service to the live compose; add a 2 GB swapfile; reverse-proxy a
  route (Traefik/Caddy) so the app can reach it over HTTPS.
- 🔴 **Unblock:** Ethan adds an SSH key / `~/.ssh/config` entry for
  `ubuntu@100.63.45.196`, or hands over the deploy path.

## Phase 1 — content API

- 🟢 Schema: `units`, `lessons`, `cards` (hanzi, pinyin, gloss, audioUrl, unit,
  lesson, tags). Seed script: load `public/mandarin-source.json` → Postgres.
- 🟢 `GET /v1/content` returns the deck payload the app expects (shape-compatible
  with today's JSON so the client change is minimal).
- 🟢 App: `deck.ts:52` fetches `${API}/v1/content` instead of `/mandarin-source.json`;
  keep the bundled JSON as a cached fallback when the API is unreachable.
- 🔴 Deploy + seed on the box.

## Phase 2 — transcription endpoint (the brief's original first step)

- 🟢 `POST /v1/transcribe` (multipart clip) → faster-whisper `base` → `{text}`;
  model loaded lazily, simplified-Chinese output. Local test with a fixture clip.
- 🟢 App: `toneCoach.svelte.ts` uploads the recording instead of loading a model;
  delete `mandarinWhisper.ts`; drop `@huggingface/transformers` + `opencc-js` from
  `package.json`; keep `comparePronunciation` alignment.
- 🔴 Deploy; confirm RAM burst is safe (swap in place).

## Phase 3 — accounts + server progress

- 🟢 Auth: `POST /v1/auth/register|login|logout`, argon2id, signed session token;
  `users` table. Progress: `progress` table keyed by user+card; `GET/PUT
  /v1/progress`. Field-aware merge preserved server-side.
- 🟢 App: login UI; progress store reads/writes the API; local cache for
  responsiveness; **retire** the encrypted-sync controller + Worker `/v1/blob`.
- 🔴 Deploy; migrate any existing local progress on first login.

## Phase 4 — cleanup / federation

- Decide the `Character` GraphQL subgraph's home (stay on Worker vs. move to
  mandarin-api). Trim the Worker to audio-only. Revisit Whisper scaling if usage
  grows.

## Status (2026-08-20)

- **Phase 0** — `server/` FastAPI scaffold + `/health` + smoke test. ✅ code-complete.
- **Phase 1** — content tables, `seed_payload` + `scripts/seed_content.py` (real
  corpus seeds 4 units / 3222 cards), `GET /v1/content`; app `deck.ts` fetches the
  API with the bundled JSON as fallback. ✅ code-complete, tests green.
- **Phase 2** — `POST /v1/transcribe` (faster-whisper, lazy, threadpool, t2s);
  app uploads the clip; `mandarinWhisper.ts` deleted, `@huggingface/transformers`
  + `opencc-js` dropped. ✅ code-complete, tests green.
- 🔴 **All of Phase 0–2 is undeployed** — waiting on SSH to the box. Nothing is
  live yet; the app still runs on bundled content because `API_BASE` is unset.
- **Phase 3** (accounts + server progress) — not started; next buildable chunk.

Recommended next: **unblock SSH and deploy Phases 0–2** to validate the whole
stack against the real box before building Phase 3 on top of undeployed code.
