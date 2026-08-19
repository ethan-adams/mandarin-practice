import { describe, expect, it } from 'vitest';
import {
  decryptJson,
  deriveBlobId,
  encryptJson,
  generateSyncCode,
  isEncryptedBlob,
  normalizeSyncCode,
} from './crypto';

describe('sync crypto', () => {
  const code = 'abcd-efgh-jkmn-pqrs-tuvw';

  it('round-trips a value through encrypt/decrypt', async () => {
    const value = { hello: '你好', n: 42, list: [1, 2, 3] };
    const blob = await encryptJson(code, value);
    expect(isEncryptedBlob(blob)).toBe(true);
    expect(await decryptJson(code, blob)).toEqual(value);
  });

  it('produces different ciphertext each call (fresh salt + iv)', async () => {
    const a = await encryptJson(code, { x: 1 });
    const b = await encryptJson(code, { x: 1 });
    expect(a.ct).not.toBe(b.ct);
    expect(a.iv).not.toBe(b.iv);
    expect(a.salt).not.toBe(b.salt);
  });

  it('fails to decrypt with the wrong code', async () => {
    const blob = await encryptJson(code, { secret: true });
    await expect(decryptJson('wrong-code', blob)).rejects.toBeDefined();
  });

  it('derives a stable, code-specific blob id', async () => {
    const id1 = await deriveBlobId(code);
    const id2 = await deriveBlobId(code);
    const other = await deriveBlobId('zzzz-zzzz');
    expect(id1).toBe(id2);
    expect(id1).not.toBe(other);
    expect(id1).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, URL-safe
  });

  it('normalizes codes so case and spacing do not fork a device', async () => {
    expect(normalizeSyncCode('  ABCD EFGH ')).toBe('abcd-efgh');
    expect(await deriveBlobId('ABCD EFGH')).toBe(await deriveBlobId('abcd-efgh'));
  });

  it('generates a grouped, transcribable code without ambiguous characters', () => {
    const generated = generateSyncCode();
    expect(generated).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){4}$/);
    expect(generated).not.toMatch(/[01oil]/);
  });

  it('rejects non-blobs in the shape guard', () => {
    expect(isEncryptedBlob(null)).toBe(false);
    expect(isEncryptedBlob({ v: 1 })).toBe(false);
    expect(isEncryptedBlob({ v: 2, kdf: 'PBKDF2-SHA256', iters: 1, salt: '', iv: '', ct: '' })).toBe(false);
  });
});
