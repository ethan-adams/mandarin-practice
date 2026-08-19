// Job 1 of the Mandarin backend: the encrypted-progress blob store. Dependency
// free on purpose (only Web APIs + a tiny KV interface) so it runs in a
// Cloudflare Worker and is unit-testable from the app's vitest without wrangler.
//
// The server never sees plaintext: it stores and returns an opaque EncryptedBlob
// keyed by a non-secret id the client derived from its sync code. See
// ../../VISION.md ("Encrypted progress sync") for the model and threat notes.

/** The subset of Cloudflare's KVNamespace this store needs. */
export interface BlobKV {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export type SyncOptions = {
  /** Reject bodies larger than this many bytes. Default 256 KiB. */
  maxBlobBytes?: number;
};

const DEFAULT_MAX_BLOB_BYTES = 256 * 1024;
// SHA-256 as base64url is 43 chars; allow a little slack, reject anything wild.
const BLOB_ID_RE = /^[A-Za-z0-9_-]{20,64}$/;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** Minimal server-side shape check — enough to reject junk, not to trust contents. */
function looksLikeEncryptedBlob(value: unknown): boolean {
  const b = value as Record<string, unknown> | null;
  return !!b && b.v === 1 && b.kdf === 'PBKDF2-SHA256' && typeof b.iters === 'number'
    && typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string';
}

/**
 * Handle a `/v1/blob/:id` request. Returns null when the path is not a sync
 * route, so the caller can fall through to other handlers (e.g. GraphQL).
 */
export async function handleSync(request: Request, kv: BlobKV, opts: SyncOptions = {}): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const match = pathname.match(/^\/v1\/blob\/([^/]+)$/);
  if (!match) return null;

  const blobId = decodeURIComponent(match[1]);
  if (!BLOB_ID_RE.test(blobId)) return json(400, { error: 'invalid blob id' });

  const maxBytes = opts.maxBlobBytes ?? DEFAULT_MAX_BLOB_BYTES;

  switch (request.method) {
    case 'GET': {
      const stored = await kv.get(blobId);
      if (stored == null) return json(404, { error: 'not found' });
      return new Response(stored, {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }

    case 'PUT': {
      const raw = await request.text();
      if (raw.length > maxBytes) return json(413, { error: 'blob too large' });
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return json(400, { error: 'body must be JSON' });
      }
      if (!looksLikeEncryptedBlob(parsed)) return json(422, { error: 'not an encrypted blob' });
      await kv.put(blobId, raw);
      return json(200, { ok: true });
    }

    case 'DELETE': {
      await kv.delete(blobId);
      return json(200, { ok: true });
    }

    default:
      return json(405, { error: 'method not allowed' });
  }
}
