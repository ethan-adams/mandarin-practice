#!/usr/bin/env bash
# Deploy mandarin-api onto the Lightsail box, reusing the draw-prod stack's
# Postgres and docker network. Idempotent: safe to re-run. Run with sudo:
#   sudo bash ~/mandarin-src/server/deploy/box-deploy.sh
#
# This is the INTERNAL deploy + validation (no public route yet). Public
# exposure (Caddy edge-site + DNS) is box-expose.sh, run after DNS is set.
set -euo pipefail

NET=draw-prod_default
PG=draw-prod-postgres-1
IMAGE=mandarin-api:latest
NAME=mandarin-api

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)   # .../server/deploy
SRV=$(dirname "$SCRIPT_DIR")                                # .../server
ROOT=$(dirname "$SRV")                                      # .../mandarin-src
CORPUS="$ROOT/corpus.json"

echo "== 1. ensure mandarin database exists =="
if docker exec "$PG" psql -U draw -tAc "SELECT 1 FROM pg_database WHERE datname='mandarin'" | grep -q 1; then
  echo "   mandarin DB already present"
else
  docker exec "$PG" createdb -U draw -O draw mandarin
  echo "   created mandarin DB"
fi

echo "== 2. read draw postgres password (not printed) =="
PGPW=$(docker exec "$PG" printenv POSTGRES_PASSWORD)
DSN="postgresql+asyncpg://draw:${PGPW}@postgres:5432/mandarin"

echo "== 3. build image =="
docker build -t "$IMAGE" "$SRV"

echo "== 4. (re)start container on $NET =="
SECRET_FILE=/opt/mandarin-session-secret
if [ ! -f "$SECRET_FILE" ]; then openssl rand -hex 32 > "$SECRET_FILE"; chmod 600 "$SECRET_FILE"; fi
SESSION_SECRET=$(cat "$SECRET_FILE")
docker rm -f "$NAME" 2>/dev/null || true
docker run -d --name "$NAME" --restart unless-stopped \
  --network "$NET" \
  -e MANDARIN_DATABASE_URL="$DSN" \
  -e MANDARIN_SESSION_SECRET="$SESSION_SECRET" \
  -e MANDARIN_CORS_ORIGINS="https://mandarin.ethanadams.dev,http://localhost:5173" \
  -e MANDARIN_CORS_ORIGIN_REGEX="https://mandarin-practice-[a-z0-9-]+-ethans-projects-8a17cbc5\.vercel\.app" \
  -e MANDARIN_WHISPER_MODEL=base \
  -v mandarin_whisper:/root/.cache/huggingface \
  "$IMAGE"

echo "== 5. wait for readiness =="
for i in $(seq 1 30); do
  if docker exec "$NAME" python -c "import urllib.request;urllib.request.urlopen('http://localhost:8000/health')" 2>/dev/null; then
    echo "   ready after ${i}s"; break
  fi
  sleep 1
  if [ "$i" = "30" ]; then echo "   NOT READY — logs:"; docker logs --tail 40 "$NAME"; exit 1; fi
done

echo "== 6. seed corpus =="
docker run --rm --network "$NET" \
  -e MANDARIN_DATABASE_URL="$DSN" \
  -v "$CORPUS":/data/corpus.json:ro \
  "$IMAGE" python -m scripts.seed_content /data/corpus.json

echo "== 7. validate internally =="
docker exec "$NAME" python - <<'PY'
import json, urllib.request
b = "http://localhost:8000"
h = json.loads(urllib.request.urlopen(b + "/health").read())
print("HEALTH:", h)
c = json.loads(urllib.request.urlopen(b + "/v1/content").read())
print("CONTENT: card_count=%s lesson_count=%s units=%d cards=%d"
      % (c.get("card_count"), c.get("lesson_count"), len(c.get("units") or []), len(c.get("cards") or [])))
api = json.loads(urllib.request.urlopen(b + "/openapi.json").read())
print("ROUTES:", sorted(api["paths"].keys()))
assert "/v1/transcribe" in api["paths"], "transcribe route missing"
assert (c.get("cards") and len(c["cards"]) > 3000), "content not seeded"
print("VALIDATION: PASS")
PY

echo "== DONE (internal). Public exposure: box-expose.sh after DNS =="
