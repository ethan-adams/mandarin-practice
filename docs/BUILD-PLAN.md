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
- ✅ **DEPLOYED + LIVE on the box (2026-08-20).** mandarin-api runs on
  `draw-prod_default`, reusing the draw-prod Postgres (new `mandarin` DB) and Caddy.
  Validated: `/health` ok; `/v1/content` serves 3222 cards from Postgres;
  `/v1/transcribe` transcribed a real 不客气 clip → `不客气` in ~5s. Scripts:
  `server/deploy/box-deploy.sh`, `box-expose.sh`.
- ✅ **PUBLIC + wired (2026-08-20).** `https://mandarin-api.ethanadams.dev`
  (Namecheap A record → box; Caddy edge-site + Let's Encrypt cert). Verified:
  public `/health`, `/v1/content` (3222 cards), CORS for `http://localhost:5173`.
  `.env` sets `VITE_API_BASE`; the app build embeds it. `.env.example` committed.
- ✅ **Phase 3 — accounts + server-owned progress (2026-08-20).** Server: users +
  progress tables, argon2id + bearer tokens, `/v1/auth/*`, `/v1/progress` (merges
  on write). Client: `account/` (progressClient + accountController) + AccountPanel
  replaces SyncPanel; account-optional (local-only still works offline). Encrypted
  sync-code path deleted (syncController/syncClient/crypto/bytes). Deployed +
  validated live; 176 app tests + 13 server tests green.
- Frontend has no prod host yet (local-dev runs against the live backend) — a
  separate later thread.

## Phase 4 — redesign / rework (in progress, branch `rethink-audio-selection`)

Ships to the Vercel **preview** each push; go-live = merge to `main`. Increments
landed so far (all with tests + build green):

1. ✅ ea-design "Ink & Jade" theme adopted.
2. ✅ Explore home (CourseHome): no due dates, jade primary, calm copy.
3. ✅ Auto-judge (no Again/Good/Easy): `logic/autoRating.ts`.
4. ✅ **Journey screen** (2026-08-22) — progress by *character* (met / sticking
   well), no due dates; gentle streak; grid of met characters that open a story.
   `logic/journey.ts` (+test), `components/Journey.svelte`. Pill nav Explore ·
   Journey in the header.
5. ✅ **Drawing promoted** (2026-08-22) — `WritingPractice` canvas is now
   container-sized (240–360px) and touch-friendly (`touch-action:none`, big
   controls); the in-card entry is a first-class "Trace it" step.
6. ✅ **Character Story** (2026-08-22) — component breakdown (好 = 女 + 子),
   radical, meaning, etymology + animated strokes + Trace. Data =
   `public/hanzi-dict.json` (Make Me a Hanzi subset; `scripts/build-hanzi-dict.mjs`,
   manual — builds use the committed JSON, no network). Reached from the Journey
   grid and by tapping any hanzi in a revealed answer. **Ancient-form (oracle/
   seal) evolution deferred** — no free, well-licensed, well-covered dataset;
   ships on derivable component etymology for now.

**Next:** cultural festivals in season; then, on Ethan's approval, merge
`rethink-audio-selection` → `main` to ship the redesign to mandarin.ethanadams.dev.

### Cleanup left
- **Stale word-check copy (honesty bug):** `ToneCoachPanel` still says word check
  is a "~230 MB download, runs on your device — no audio leaves it." That was the
  retired on-device Whisper; word check is now server-side (clip uploaded to
  `/v1/transcribe`). Copy must be corrected — audio *does* leave the device now.
- The Cloudflare Worker still carries the now-unused `/v1/blob` sync route (dead
  code — the app no longer calls it). Trim the Worker to audio-only when convenient.
- A real browser E2E of the account + word-check loop (needs a human + mic).
- `Character` GraphQL subgraph home (stay on Worker vs. move) — deferred.

Note: the `ethanadams.dev` DNS zone is on **Namecheap** (`dns1/dns2.registrar-
servers.com`), not Cloudflare. New box subdomains = A record in Namecheap Advanced
DNS + a `/opt/edge-sites/*.caddy` file (box-expose.sh).
