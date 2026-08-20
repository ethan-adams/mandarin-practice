// Job 2 of the Mandarin backend: serve prebuilt audio clips from the
// `mandarin-audio` R2 bucket. Clips are content-addressed and immutable, so we
// serve them with a one-year immutable cache and lean on Cloudflare's edge cache
// (via the runtime cache) so repeat plays don't re-read R2. See ../../VISION.md
// ("Audio serving"). CORS is applied by the caller's withCors wrapper.
//
// Kept dependency-free (only a tiny structural R2 interface) so it stays
// unit-testable from the app's vitest without wrangler, matching sync.ts.

/** The subset of an R2 object this handler reads. */
export interface AudioObject {
  body: ReadableStream | null;
  httpEtag: string;
  writeHttpMetadata(headers: Headers): void;
}

/** The subset of Cloudflare's R2Bucket this handler needs. */
export interface AudioBucket {
  get(key: string): Promise<AudioObject | null>;
}

const AUDIO_PREFIX = '/v1/audio/';
// Content-addressed keys look like `clips/<40 hex>.mp3` (plus a version segment).
// Reject anything that could traverse or is obviously not a clip key.
const KEY_RE = /^[A-Za-z0-9_./-]{1,256}$/;

/**
 * Handle a `/v1/audio/:key` request. Returns null when the path is not an audio
 * route, so the caller can fall through to other handlers.
 */
export async function handleAudio(request: Request, bucket: AudioBucket): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  if (!pathname.startsWith(AUDIO_PREFIX)) return null;

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }

  const key = decodeURIComponent(pathname.slice(AUDIO_PREFIX.length));
  if (!key || key.includes('..') || !KEY_RE.test(key)) {
    return new Response('bad audio key', { status: 400 });
  }

  const object = await bucket.get(key);
  if (!object) return new Response('audio not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Content is immutable (the key is a hash of the audio), so cache hard.
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (!headers.has('content-type')) headers.set('content-type', 'audio/mpeg');

  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}
