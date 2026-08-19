import { describe, expect, it } from 'vitest';
import { REVIEW_STORAGE_KEY, type CardState } from '../mandarin/logic/srs';
import { PRACTICE_DAYS_KEY } from '../mandarin/logic/sessionStats';
import { collectSnapshot, type StorageLike } from './snapshot';
import { SyncClient, SyncDecryptError } from './syncClient';

// An in-memory stand-in for the Worker: a Map keyed by blob id, spoken to
// through a fetch-shaped function. Exercises the real crypto and merge paths.
function fakeServer() {
  const store = new Map<string, string>();
  const fetch = (async (url: string, init?: RequestInit) => {
    const id = decodeURIComponent(String(url).split('/v1/blob/')[1]);
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return store.has(id)
        ? { status: 200, ok: true, json: async () => JSON.parse(store.get(id)!) }
        : { status: 404, ok: false, json: async () => ({}) };
    }
    store.set(id, String(init?.body));
    return { status: 200, ok: true, json: async () => ({}) };
  }) as unknown as typeof globalThis.fetch;
  return { store, fetch };
}

function memStorage(init: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return { map, getItem: (k) => (map.has(k) ? map.get(k)! : null), setItem: (k, v) => void map.set(k, v) };
}

const card = (attempts: number): CardState => ({
  attempts, correct: attempts, misses: 0, streak: attempts, intervalDays: 2, due: '2026-01-02',
});

const CODE = 'test-code-abcd-efgh';

describe('SyncClient', () => {
  it('pushes a new blob when the server has nothing yet', async () => {
    const server = fakeServer();
    const client = new SyncClient({ baseUrl: 'https://x', fetch: server.fetch });
    const storage = memStorage({ [REVIEW_STORAGE_KEY]: JSON.stringify({ a: card(1) }) });

    const outcome = await client.sync(CODE, storage);
    expect(outcome.status).toBe('pushed-new');
    expect(outcome.pulledRemote).toBe(false);
    expect(server.store.size).toBe(1);
  });

  it('merges a second device: both end up with the union of progress', async () => {
    const server = fakeServer();
    const client = new SyncClient({ baseUrl: 'https://x', fetch: server.fetch });

    // Device A learns card "a" and pushes.
    const deviceA = memStorage({
      [REVIEW_STORAGE_KEY]: JSON.stringify({ a: card(3) }),
      [PRACTICE_DAYS_KEY]: JSON.stringify(['2026-01-01']),
    });
    await client.sync(CODE, deviceA);

    // Device B learns card "b", links the same code, and syncs.
    const deviceB = memStorage({
      [REVIEW_STORAGE_KEY]: JSON.stringify({ b: card(2) }),
      [PRACTICE_DAYS_KEY]: JSON.stringify(['2026-01-02']),
    });
    const outcome = await client.sync(CODE, deviceB);
    expect(outcome.status).toBe('synced');
    expect(outcome.pulledRemote).toBe(true);
    expect(outcome.changedLocal).toBe(true);

    const merged = collectSnapshot(deviceB);
    expect(Object.keys(merged.reviewState).sort()).toEqual(['a', 'b']);
    expect(merged.practiceDays).toEqual(['2026-01-01', '2026-01-02']);

    // And after A syncs again it converges to the same union.
    await client.sync(CODE, deviceA);
    expect(Object.keys(collectSnapshot(deviceA).reviewState).sort()).toEqual(['a', 'b']);
  });

  it('reports offline and leaves local untouched when the network fails', async () => {
    const failing = (async () => { throw new Error('network down'); }) as unknown as typeof globalThis.fetch;
    const client = new SyncClient({ baseUrl: 'https://x', fetch: failing });
    const storage = memStorage({ [REVIEW_STORAGE_KEY]: JSON.stringify({ a: card(1) }) });

    const outcome = await client.sync(CODE, storage);
    expect(outcome.status).toBe('offline');
    expect(outcome.changedLocal).toBe(false);
    expect(collectSnapshot(storage).reviewState).toEqual({ a: card(1) });
  });

  it('surfaces a decrypt error when the stored blob cannot be read', async () => {
    const server = fakeServer();
    // Seed a valid-looking blob under this code's id that was encrypted... with garbage ct.
    const { deriveBlobId, encryptJson } = await import('./crypto');
    const id = await deriveBlobId(CODE);
    const blob = await encryptJson(CODE, { v: 1 });
    server.store.set(id, JSON.stringify({ ...blob, ct: 'AAAA' })); // corrupt ciphertext

    const client = new SyncClient({ baseUrl: 'https://x', fetch: server.fetch });
    await expect(client.sync(CODE, memStorage())).rejects.toBeInstanceOf(SyncDecryptError);
  });
});
