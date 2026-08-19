// The progress snapshot: the single serialisable object that captures everything
// worth syncing across devices, and the field-aware merge that reconciles two of
// them. This is the ONLY place that knows which localStorage keys constitute
// "progress"; keep it in step with the app's persistence.
//
// Design rule from VISION.md: the client is the source of truth and two devices
// MERGE rather than overwrite. A learning app used on a phone and a laptop must
// never let one device clobber a day of reviews done on the other.

import { LEGACY_REVIEW_STORAGE_KEY, REVIEW_STORAGE_KEY, type CardState } from '../mandarin/logic/srs';
import { PRACTICE_DAYS_KEY } from '../mandarin/logic/sessionStats';
import {
  listeningCountStorageKey,
  listeningStorageKey,
  pronunciationEvidenceStorageKey,
} from '../mandarin/state/storageKeys';

export const SNAPSHOT_VERSION = 1;

export type ProgressSnapshot = {
  v: 1;
  /** ISO timestamp of when this snapshot was collected; the merge keeps the later one. */
  updatedAt: string;
  reviewState: Record<string, CardState>;
  practiceDays: string[];
  listeningResults: unknown[];
  listeningCount: number;
  pronunciationEvidence: unknown[];
};

/** A localStorage-shaped surface, so snapshots are testable without a real DOM. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function readJson<T>(storage: StorageLike, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** Gather the current on-device progress into one snapshot. */
export function collectSnapshot(storage: StorageLike, now = new Date().toISOString()): ProgressSnapshot {
  const reviewRaw = storage.getItem(REVIEW_STORAGE_KEY) ?? storage.getItem(LEGACY_REVIEW_STORAGE_KEY);
  let reviewState: Record<string, CardState> = {};
  try {
    reviewState = reviewRaw ? (JSON.parse(reviewRaw) as Record<string, CardState>) : {};
  } catch {
    reviewState = {};
  }
  const listeningCountRaw = Number(storage.getItem(listeningCountStorageKey));
  return {
    v: SNAPSHOT_VERSION,
    updatedAt: now,
    reviewState,
    practiceDays: readJson<string[]>(storage, PRACTICE_DAYS_KEY, []),
    listeningResults: readJson<unknown[]>(storage, listeningStorageKey, []),
    listeningCount: Number.isFinite(listeningCountRaw) ? listeningCountRaw : 0,
    pronunciationEvidence: readJson<unknown[]>(storage, pronunciationEvidenceStorageKey, []),
  };
}

/**
 * Write a snapshot back into localStorage in exactly the shape each app module
 * expects. Note the listening count is stored as a BARE number string (matching
 * ListeningStore), everything else as JSON.
 */
export function applySnapshot(storage: StorageLike, snapshot: ProgressSnapshot): void {
  storage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(snapshot.reviewState));
  storage.setItem(PRACTICE_DAYS_KEY, JSON.stringify(snapshot.practiceDays));
  storage.setItem(listeningStorageKey, JSON.stringify(snapshot.listeningResults));
  storage.setItem(listeningCountStorageKey, String(snapshot.listeningCount));
  storage.setItem(pronunciationEvidenceStorageKey, JSON.stringify(snapshot.pronunciationEvidence));
}

/** More-progressed wins: more attempts, then the later due date (longer interval / more recent review). */
function pickCardState(a: CardState | undefined, b: CardState | undefined): CardState | undefined {
  if (!a) return b;
  if (!b) return a;
  if ((a.attempts ?? 0) !== (b.attempts ?? 0)) return (a.attempts ?? 0) > (b.attempts ?? 0) ? a : b;
  return (a.due ?? '') >= (b.due ?? '') ? a : b;
}

/**
 * Reconcile two snapshots into one, field by field. Commutative in effect (same
 * result whichever device pulls), so repeated syncs converge:
 *   - reviewState: per card, the more-progressed state
 *   - practiceDays: sorted set union (a practiced day is never un-practiced)
 *   - listening/evidence history: the longer record (strictly grows)
 *   - listeningCount: the max
 */
export function mergeSnapshots(a: ProgressSnapshot, b: ProgressSnapshot): ProgressSnapshot {
  const reviewState: Record<string, CardState> = {};
  for (const id of new Set([...Object.keys(a.reviewState), ...Object.keys(b.reviewState)])) {
    const winner = pickCardState(a.reviewState[id], b.reviewState[id]);
    if (winner) reviewState[id] = winner;
  }
  const longer = <T>(x: T[], y: T[]) => (x.length >= y.length ? x : y);
  return {
    v: SNAPSHOT_VERSION,
    updatedAt: a.updatedAt >= b.updatedAt ? a.updatedAt : b.updatedAt,
    reviewState,
    practiceDays: [...new Set([...a.practiceDays, ...b.practiceDays])].sort(),
    listeningResults: longer(a.listeningResults, b.listeningResults),
    listeningCount: Math.max(a.listeningCount, b.listeningCount),
    pronunciationEvidence: longer(a.pronunciationEvidence, b.pronunciationEvidence),
  };
}

/** Shape guard for a snapshot decrypted off the wire. */
export function isProgressSnapshot(value: unknown): value is ProgressSnapshot {
  const s = value as Partial<ProgressSnapshot> | null;
  return !!s && s.v === SNAPSHOT_VERSION && typeof s.updatedAt === 'string'
    && typeof s.reviewState === 'object' && s.reviewState !== null
    && Array.isArray(s.practiceDays) && typeof s.listeningCount === 'number'
    && Array.isArray(s.listeningResults) && Array.isArray(s.pronunciationEvidence);
}
