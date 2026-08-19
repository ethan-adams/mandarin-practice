// Client-side encryption for progress sync. The whole security model lives here:
// the server only ever sees an opaque EncryptedBlob and a non-secret blob id, and
// can never read progress. See ../../VISION.md ("Encrypted progress sync").
//
// The sync code is a high-entropy bearer secret. It derives two domain-separated
// values:
//   - blobId  = base64url(SHA-256("mandarin-sync-id:v1:" + code))  -> server key
//   - key     = PBKDF2-SHA256(code, per-blob salt)                 -> AES-GCM key
// Domain separation (distinct prefix + a slow, salted KDF for the key) means
// handing the server the fast id hash never helps it derive the encryption key.

import { base64urlToBytes, bytesToBase64url, bytesToUtf8, utf8ToBytes } from './bytes';

const PBKDF2_ITERATIONS = 210_000; // OWASP 2023 floor for PBKDF2-HMAC-SHA256
const SALT_BYTES = 16;
const IV_BYTES = 12; // AES-GCM standard nonce length
const BLOB_ID_PREFIX = 'mandarin-sync-id:v1:';

/** The opaque envelope stored on the server. No plaintext, no PII. */
export type EncryptedBlob = {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iters: number;
  salt: string; // base64url
  iv: string; // base64url
  ct: string; // base64url — AES-256-GCM ciphertext of the JSON snapshot
};

const subtle = () => globalThis.crypto.subtle;

/**
 * A fresh, human-transcribable sync code: five groups of four lowercase
 * base32-ish chars (~95 bits of entropy). Ambiguous characters (0/o, 1/l/i) are
 * excluded so it survives being read off one screen and typed into another.
 */
export function generateSyncCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0 o 1 l i
  const bytes = new Uint8Array(20);
  globalThis.crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  return [0, 4, 8, 12, 16].map((i) => chars.slice(i, i + 4).join('')).join('-');
}

/** Whitespace/case-insensitive normalisation so "ABCD EFGH" links the same device as "abcd-efgh". */
export function normalizeSyncCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, '-');
}

/** Non-secret identifier the server keys the blob on. Reveals nothing about the code. */
export async function deriveBlobId(code: string): Promise<string> {
  const digest = await subtle().digest('SHA-256', utf8ToBytes(BLOB_ID_PREFIX + normalizeSyncCode(code)));
  return bytesToBase64url(new Uint8Array(digest));
}

async function deriveKey(code: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const baseKey = await subtle().importKey('raw', utf8ToBytes(normalizeSyncCode(code)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypt any JSON-serialisable value under the sync code. A fresh salt+iv per call. */
export async function encryptJson(code: string, value: unknown): Promise<EncryptedBlob> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(code, salt, PBKDF2_ITERATIONS);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ciphertext = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plaintext));
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iters: PBKDF2_ITERATIONS,
    salt: bytesToBase64url(salt),
    iv: bytesToBase64url(iv),
    ct: bytesToBase64url(ciphertext),
  };
}

/** Decrypt a blob produced by {@link encryptJson}. Throws if the code is wrong or the blob is tampered. */
export async function decryptJson<T = unknown>(code: string, blob: EncryptedBlob): Promise<T> {
  const salt = base64urlToBytes(blob.salt);
  const iv = base64urlToBytes(blob.iv);
  const key = await deriveKey(code, salt, blob.iters);
  const plaintext = await subtle().decrypt({ name: 'AES-GCM', iv }, key, base64urlToBytes(blob.ct));
  return JSON.parse(bytesToUtf8(new Uint8Array(plaintext))) as T;
}

/** Shape guard for data coming back off the wire before we try to decrypt it. */
export function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  const b = value as Partial<EncryptedBlob> | null;
  return !!b && b.v === 1 && b.kdf === 'PBKDF2-SHA256' && typeof b.iters === 'number'
    && typeof b.salt === 'string' && typeof b.iv === 'string' && typeof b.ct === 'string';
}
