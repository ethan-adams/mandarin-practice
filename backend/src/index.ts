// The Mandarin backend — a single Cloudflare Worker with two jobs (see
// ../../VISION.md): encrypted progress sync (opaque blob store, /v1/blob/*) and
// the Character subgraph (/graphql). Both are wrapped with permissive CORS: the
// sync data is end-to-end encrypted and the graph is public read-only corpus
// data, so there is nothing to protect by origin, and no cookies are ever used.

import { handleGraphQL } from './graphql';
import { handleSync, type BlobKV } from './sync';

export interface Env {
  /** KV namespace binding for the encrypted progress blobs. */
  SYNC: BlobKV;
  /** Optional CORS allow-list origin; defaults to '*'. */
  ALLOW_ORIGIN?: string;
  /** Optional max blob size in bytes (string, from wrangler vars). */
  MAX_BLOB_BYTES?: string;
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOW_ORIGIN || '*',
    'access-control-allow-methods': 'GET, PUT, DELETE, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
  };
}

function withCors(response: Response, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(env))) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    const { pathname } = new URL(request.url);

    if (pathname === '/' || pathname === '/health') {
      return withCors(new Response('mandarin-backend: ok', { status: 200 }), env);
    }

    if (pathname === '/graphql') {
      return withCors(await handleGraphQL(request), env);
    }

    const maxBlobBytes = env.MAX_BLOB_BYTES ? Number(env.MAX_BLOB_BYTES) : undefined;
    const syncResponse = await handleSync(request, env.SYNC, { maxBlobBytes });
    if (syncResponse) return withCors(syncResponse, env);

    return withCors(new Response(JSON.stringify({ error: 'not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }), env);
  },
};
