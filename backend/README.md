# Mandarin backend

A single Cloudflare Worker (free tier, ~$0) that does two jobs for the Mandarin
Practice app. See [`../VISION.md`](../VISION.md) for the why.

1. **Encrypted progress sync** — an opaque blob store at `/v1/blob/:id`. Progress
   is encrypted **in the browser** before it ever arrives here; the server only
   stores and returns ciphertext keyed by a non-secret id the client derived from
   its sync code. The server can't read your progress.
2. **The `Character` subgraph** — a read-only, corpus-derived GraphQL API at
   `/graphql`. `Character` is a federation entity (`@key(fields: "hanzi")`), ready
   to compose into the portfolio supergraph beside Draw and Loupe.

## Local development (no Cloudflare account needed)

```bash
cd backend
npm install
npm run build-corpus   # regenerate src/corpus.json from ../public/mandarin-source.json
npm run dev            # wrangler dev — simulates KV locally on http://localhost:8787
```

Smoke test it:

```bash
# GraphQL
curl -s localhost:8787/graphql -H 'content-type: application/json' \
  -d '{"query":"{ course { characterCount hskLevels } character(hanzi:\"爱\"){ pinyin glossEn hsk } }"}'

# Sync round-trip (blob id is normally derived client-side; any base64url id works locally)
curl -s -X PUT localhost:8787/v1/blob/testid0000000000000000 \
  -H 'content-type: application/json' \
  -d '{"v":1,"kdf":"PBKDF2-SHA256","iters":210000,"salt":"AA","iv":"AA","ct":"AA"}'
curl -s localhost:8787/v1/blob/testid0000000000000000
```

## Deploy (one-time Cloudflare setup — you run these)

Wrangler needs your (free) Cloudflare login and a KV namespace. These are
interactive/account steps, so run them yourself:

```bash
cd backend
npx wrangler login                                  # opens a browser
npx wrangler kv namespace create SYNC               # prints an id
# paste that id into wrangler.toml -> [[kv_namespaces]] id
npm run deploy
```

Then point the app at it by setting `VITE_SYNC_URL` to the deployed Worker URL
(e.g. in the app's `.env`), rebuild the app, and progress sync goes live.

## API

| Method | Path             | Purpose                                             |
| ------ | ---------------- | --------------------------------------------------- |
| GET    | `/health`        | Liveness.                                           |
| GET    | `/v1/blob/:id`   | Fetch the encrypted blob (404 if none).             |
| PUT    | `/v1/blob/:id`   | Store an encrypted blob (validated shape, size cap).|
| DELETE | `/v1/blob/:id`   | Delete the blob.                                    |
| POST   | `/graphql`       | Run a GraphQL query.                                |
| GET    | `/graphql`       | The subgraph SDL (or `?query=` for a quick check).  |
