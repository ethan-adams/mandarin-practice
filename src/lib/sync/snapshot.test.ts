import { describe, expect, it } from 'vitest';
import { LEGACY_REVIEW_STORAGE_KEY, REVIEW_STORAGE_KEY, type CardState } from '../mandarin/logic/srs';
import { PRACTICE_DAYS_KEY } from '../mandarin/logic/sessionStats';
import {
  listeningCountStorageKey,
  listeningStorageKey,
  pronunciationEvidenceStorageKey,
} from '../mandarin/state/storageKeys';
import {
  applySnapshot,
  collectSnapshot,
  mergeSnapshots,
  type ProgressSnapshot,
  type StorageLike,
} from './snapshot';

function memStorage(init: Record<string, string> = {}): StorageLike & { map: Map<string, string> } {
  const map = new Map(Object.entries(init));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
  };
}

const card = (over: Partial<CardState> = {}): CardState => ({
  attempts: 1, correct: 1, misses: 0, streak: 1, intervalDays: 2, due: '2026-01-02', ...over,
});

const snapshot = (over: Partial<ProgressSnapshot> = {}): ProgressSnapshot => ({
  v: 1, updatedAt: '2026-01-01T00:00:00.000Z', reviewState: {}, practiceDays: [],
  listeningResults: [], listeningCount: 0, pronunciationEvidence: [], ...over,
});

describe('collectSnapshot', () => {
  it('gathers every progress key, including the bare-number listening count', () => {
    const storage = memStorage({
      [REVIEW_STORAGE_KEY]: JSON.stringify({ a: card() }),
      [PRACTICE_DAYS_KEY]: JSON.stringify(['2026-01-01']),
      [listeningStorageKey]: JSON.stringify([{ ok: true }]),
      [listeningCountStorageKey]: '7', // stored as a bare string, not JSON
      [pronunciationEvidenceStorageKey]: JSON.stringify([{ miss: 'x' }]),
    });
    const snap = collectSnapshot(storage, '2026-02-02T00:00:00.000Z');
    expect(snap.reviewState).toEqual({ a: card() });
    expect(snap.practiceDays).toEqual(['2026-01-01']);
    expect(snap.listeningCount).toBe(7);
    expect(snap.listeningResults).toEqual([{ ok: true }]);
    expect(snap.pronunciationEvidence).toEqual([{ miss: 'x' }]);
    expect(snap.updatedAt).toBe('2026-02-02T00:00:00.000Z');
  });

  it('falls back to the legacy review key and tolerates missing/corrupt keys', () => {
    const storage = memStorage({
      [LEGACY_REVIEW_STORAGE_KEY]: JSON.stringify({ b: card() }),
      [PRACTICE_DAYS_KEY]: 'not json',
    });
    const snap = collectSnapshot(storage);
    expect(snap.reviewState).toEqual({ b: card() });
    expect(snap.practiceDays).toEqual([]);
    expect(snap.listeningCount).toBe(0);
  });
});

describe('applySnapshot', () => {
  it('writes each key back in the shape the app reads (count as a bare string)', () => {
    const storage = memStorage();
    applySnapshot(storage, snapshot({ reviewState: { a: card() }, practiceDays: ['2026-01-01'], listeningCount: 3 }));
    expect(storage.map.get(listeningCountStorageKey)).toBe('3');
    expect(JSON.parse(storage.map.get(REVIEW_STORAGE_KEY)!)).toEqual({ a: card() });
    expect(JSON.parse(storage.map.get(PRACTICE_DAYS_KEY)!)).toEqual(['2026-01-01']);
  });

  it('round-trips: collect -> apply -> collect is stable', () => {
    const original = snapshot({ reviewState: { a: card({ attempts: 5 }) }, practiceDays: ['2026-01-01'], listeningCount: 9 });
    const storage = memStorage();
    applySnapshot(storage, original);
    const back = collectSnapshot(storage, original.updatedAt);
    expect(back).toEqual(original);
  });
});

describe('mergeSnapshots', () => {
  it('keeps the more-progressed card state per id', () => {
    const a = snapshot({ reviewState: { x: card({ attempts: 2, due: '2026-01-05' }), y: card() } });
    const b = snapshot({ reviewState: { x: card({ attempts: 5, due: '2026-01-03' }), z: card() } });
    const merged = mergeSnapshots(a, b);
    expect(merged.reviewState.x.attempts).toBe(5); // more attempts wins
    expect(Object.keys(merged.reviewState).sort()).toEqual(['x', 'y', 'z']); // union
  });

  it('breaks attempt ties by the later due date', () => {
    const a = snapshot({ reviewState: { x: card({ attempts: 3, due: '2026-01-10' }) } });
    const b = snapshot({ reviewState: { x: card({ attempts: 3, due: '2026-01-02' }) } });
    expect(mergeSnapshots(a, b).reviewState.x.due).toBe('2026-01-10');
  });

  it('unions practice days, maxes the count, and keeps the longer history', () => {
    const a = snapshot({ practiceDays: ['2026-01-02', '2026-01-01'], listeningCount: 3, pronunciationEvidence: [1] });
    const b = snapshot({ practiceDays: ['2026-01-02', '2026-01-03'], listeningCount: 8, pronunciationEvidence: [1, 2, 3] });
    const merged = mergeSnapshots(a, b);
    expect(merged.practiceDays).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(merged.listeningCount).toBe(8);
    expect(merged.pronunciationEvidence).toEqual([1, 2, 3]);
  });

  it('is order-independent in effect', () => {
    const a = snapshot({ reviewState: { x: card({ attempts: 2 }) }, practiceDays: ['2026-01-01'], listeningCount: 1 });
    const b = snapshot({ reviewState: { x: card({ attempts: 4 }) }, practiceDays: ['2026-01-02'], listeningCount: 9 });
    const ab = mergeSnapshots(a, b);
    const ba = mergeSnapshots(b, a);
    expect(ab.reviewState).toEqual(ba.reviewState);
    expect(ab.practiceDays).toEqual(ba.practiceDays);
    expect(ab.listeningCount).toBe(ba.listeningCount);
  });
});
