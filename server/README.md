# mandarin-api

Server-owned backend for Mandarin Practice — content, accounts, progress, and
speech transcription. Runs on the Lightsail box (`portfolio-backend`) beside CCP
Signal via docker-compose, reusing that box's Postgres. See `../VISION.md`
(2026-08-20 pivot) and `../docs/BUILD-PLAN.md`.

## Local dev

```sh
cd server
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"          # add ,transcribe to test the whisper path
uvicorn app.main:app --reload       # http://localhost:8000/health
pytest
```

No Postgres needed for the health check. Content/auth/progress phases add a local
Postgres (`MANDARIN_DATABASE_URL`).

## Config (env, `MANDARIN_` prefix)

| var | default | notes |
|-----|---------|-------|
| `MANDARIN_DATABASE_URL` | local Postgres | reuse the box's Postgres, `mandarin` DB |
| `MANDARIN_SESSION_SECRET` | dev-only | **must** be set on the box |
| `MANDARIN_CORS_ORIGINS` | localhost:5173 | comma-separated app origins |
| `MANDARIN_WHISPER_MODEL` | `base` | `tiny` if the 2 GB box is tight |

## Deploy (once SSH access exists)

1. Get the repo onto the box; `createdb -U postgres mandarin` in the existing PG.
2. Merge `docker-compose.fragment.yml` into the box's compose; set secrets.
3. Add a 2 GB swapfile (Whisper RAM safety net).
4. Front `mandarin-api` with the existing reverse proxy over HTTPS.

## Endpoints

- `GET /health` — liveness. *(Phase 0, done.)*
- `GET /v1/content` — deck payload from Postgres. *(Phase 1.)*
- `POST /v1/transcribe` — clip → faster-whisper → text. *(Phase 2.)*
- `POST /v1/auth/*`, `GET|PUT /v1/progress` — accounts + server progress. *(Phase 3.)*
