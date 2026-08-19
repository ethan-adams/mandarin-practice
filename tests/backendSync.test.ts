import { describe, expect, it } from 'vitest';
import { handleSync, type BlobKV } from '../backend/src/sync';

function fakeKv(): BlobKV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: async (k) => (map.has(k) ? map.get(k)! : null),
    put: async (k, v) => void map.set(k, v),
    delete: async (k) => void map.delete(k),
  };
}

const ID = 'testid0000000000000000'; // valid base64url, within length bounds
const url = (id = ID) => `https://api.test/v1/blob/${id}`;
const blob = { v: 1, kdf: 'PBKDF2-SHA256', iters: 210000, salt: 'AA', iv: 'AA', ct: 'AA' };
const putReq = (body: unknown, id = ID) =>
  new Request(url(id), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

describe('backend sync handler', () => {
  it('stores and returns an encrypted blob', async () => {
    const kv = fakeKv();
    const put = await handleSync(putReq(blob), kv);
    expect(put?.status).toBe(200);
    expect(kv.map.get(ID)).toBe(JSON.stringify(blob));

    const get = await handleSync(new Request(url()), kv);
    expect(get?.status).toBe(200);
    expect(await get!.json()).toEqual(blob);
  });

  it('404s an unknown blob', async () => {
    const res = await handleSync(new Request(url()), fakeKv());
    expect(res?.status).toBe(404);
  });

  it('rejects a bad blob id, non-JSON, and non-blob JSON', async () => {
    const kv = fakeKv();
    expect((await handleSync(new Request(url('short')), kv))?.status).toBe(400);
    expect((await handleSync(putReq('not json{'), kv))?.status).toBe(400);
    expect((await handleSync(putReq({ hello: 'world' }), kv))?.status).toBe(422);
  });

  it('enforces the size cap', async () => {
    const res = await handleSync(putReq(blob), fakeKv(), { maxBlobBytes: 4 });
    expect(res?.status).toBe(413);
  });

  it('deletes a blob and rejects unknown methods', async () => {
    const kv = fakeKv();
    await handleSync(putReq(blob), kv);
    const del = await handleSync(new Request(url(), { method: 'DELETE' }), kv);
    expect(del?.status).toBe(200);
    expect(kv.map.has(ID)).toBe(false);

    const post = await handleSync(new Request(url(), { method: 'POST' }), kv);
    expect(post?.status).toBe(405);
  });

  it('returns null for non-sync paths so other handlers can run', async () => {
    expect(await handleSync(new Request('https://api.test/graphql'), fakeKv())).toBeNull();
  });
});
