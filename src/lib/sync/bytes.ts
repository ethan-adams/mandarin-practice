// Byte/text/base64url helpers shared by the sync crypto layer. Kept dependency
// free and runtime-agnostic: the same code runs in the browser, in a Cloudflare
// Worker, and under Node/vitest. base64url (RFC 4648 §5) is used everywhere so
// encrypted-blob fields and the derived blob id are safe in JSON and URL paths.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Returns are pinned to Uint8Array<ArrayBuffer> (a fresh copy for encode) so the
// bytes satisfy WebCrypto's BufferSource, which rejects the SharedArrayBuffer-
// possible ArrayBufferLike that TextEncoder/typed arrays are typed as since TS 5.7.
export function utf8ToBytes(text: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(encoder.encode(text));
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function bytesToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
