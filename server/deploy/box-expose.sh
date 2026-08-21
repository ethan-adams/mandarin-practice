#!/usr/bin/env bash
# Publicly expose mandarin-api via the draw-prod Caddy, on its own subdomain.
# Run with sudo AFTER a DNS A record for the domain points at this box:
#   sudo DOMAIN=mandarin-api.ethanadams.dev bash ~/mandarin-src/server/deploy/box-expose.sh
# Caddy fetches a Let's Encrypt cert automatically once DNS resolves here.
set -euo pipefail

DOMAIN=${DOMAIN:-mandarin-api.ethanadams.dev}
CADDY=draw-prod-caddy-1
SITE=/opt/edge-sites/mandarin.caddy

echo "== writing $SITE for $DOMAIN =="
cat > "$SITE" <<EOF
# mandarin-api: content, transcription, accounts, progress. CORS is handled in
# the app (FastAPI middleware); Caddy just terminates TLS and proxies.
$DOMAIN {
	reverse_proxy mandarin-api:8000
}
EOF

echo "== reloading Caddy =="
docker exec "$CADDY" caddy reload --config /etc/caddy/Caddyfile

echo "== done. Verify (after cert issues, ~10s):  curl -sS https://$DOMAIN/health =="
