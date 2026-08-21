import { afterEach, describe, expect, it, vi } from 'vitest';

import { syncProgress } from './progressClient';
import { applySnapshot, type ProgressSnapshot, type StorageLike } from '../sync/snapshot';
import { PRACTICE_DAYS_KEY } from '../mandarin/logic/sessionStats';

function fakeStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

const BASE: ProgressSnapshot = {
  v: 1,
  updatedAt: '2026-08-01T00:00:00.000Z',
  reviewState: { c1: { attempts: 1, due: '2026-08-05' } } as ProgressSnapshot['reviewState'],
  practiceDays: ['2026-08-01'],
  listeningResults: [],
  listeningCount: 0,
  pronunciationEvidence: [],
};

/** Stub the server: transform the pushed snapshot into the "merged" reply. */
function stubServer(transform: (s: ProgressSnapshot) => ProgressSnapshot) {
  global.fetch = vi.fn(async (_url: string, opts: { body: string }) => {
    const pushed = (JSON.parse(opts.body) as { snapshot: ProgressSnapshot }).snapshot;
    return {
      ok: true,
      status: 200,
      json: async () => ({ snapshot: transform(pushed) }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

afterEach(() => vi.restoreAllMocks());

describe('syncProgress', () => {
  it('reports no local change when the server echoes the same data', async () => {
    const storage = fakeStorage();
    applySnapshot(storage, BASE);
    stubServer((s) => s); // server had nothing newer

    const { changedLocal } = await syncProgress('tok', storage);
    expect(changedLocal).toBe(false);
    expect(JSON.parse(storage.getItem(PRACTICE_DAYS_KEY) ?? '[]')).toEqual(['2026-08-01']);
  });

  it('applies the merged snapshot when the server has newer data', async () => {
    const storage = fakeStorage();
    applySnapshot(storage, BASE);
    stubServer((s) => ({ ...s, practiceDays: [...s.practiceDays, '2026-08-09'].sort() }));

    const { changedLocal } = await syncProgress('tok', storage);
    expect(changedLocal).toBe(true);
    expect(JSON.parse(storage.getItem(PRACTICE_DAYS_KEY) ?? '[]')).toEqual(['2026-08-01', '2026-08-09']);
  });
});
