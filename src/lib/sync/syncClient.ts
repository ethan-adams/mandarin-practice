// The two-way sync: pull the remote blob, merge it with local, write the merge
// back, and push the merge up. The server is a dumb opaque-blob store keyed by a
// non-secret id; all crypto happens here on the client. The app keeps working if
// the server is unreachable — sync just reports 'offline' and local is untouched.

import { decryptJson, deriveBlobId, encryptJson, isEncryptedBlob } from './crypto';
import {
  applySnapshot,
  collectSnapshot,
  isProgressSnapshot,
  mergeSnapshots,
  type ProgressSnapshot,
  type StorageLike,
} from './snapshot';

export type SyncStatus = 'synced' | 'pushed-new' | 'offline';

export type SyncOutcome = {
  status: SyncStatus;
  /** A blob already existed on the server and was merged in. */
  pulledRemote: boolean;
  /** The merge changed local storage (so in-memory app state should reload). */
  changedLocal: boolean;
};

/** Thrown when a fetched blob can't be decrypted — corrupt data, not a wrong code (the code keys the id). */
export class SyncDecryptError extends Error {
  constructor() {
    super('Could not decrypt the synced progress. The stored data may be corrupt.');
    this.name = 'SyncDecryptError';
  }
}

type Fetch = typeof fetch;

export class SyncClient {
  readonly #baseUrl: string;
  readonly #fetch: Fetch;

  constructor(opts: { baseUrl: string; fetch?: Fetch }) {
    this.#baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.#fetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  #url(blobId: string): string {
    return `${this.#baseUrl}/v1/blob/${encodeURIComponent(blobId)}`;
  }

  /** Fetch and decrypt the remote snapshot, or null if none is stored yet. Throws on a bad blob. */
  async pull(code: string): Promise<ProgressSnapshot | null> {
    const blobId = await deriveBlobId(code);
    const res = await this.#fetch(this.#url(blobId), { method: 'GET' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Sync pull failed: ${res.status}`);
    const body: unknown = await res.json();
    if (!isEncryptedBlob(body)) throw new SyncDecryptError();
    let snapshot: unknown;
    try {
      snapshot = await decryptJson(code, body);
    } catch {
      throw new SyncDecryptError();
    }
    if (!isProgressSnapshot(snapshot)) throw new SyncDecryptError();
    return snapshot;
  }

  /** Encrypt and store a snapshot under the code's blob id. */
  async push(code: string, snapshot: ProgressSnapshot): Promise<void> {
    const blobId = await deriveBlobId(code);
    const blob = await encryptJson(code, snapshot);
    const res = await this.#fetch(this.#url(blobId), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(blob),
    });
    if (!res.ok) throw new Error(`Sync push failed: ${res.status}`);
  }

  /**
   * Full reconcile: pull, merge with local, write the merge back to storage, and
   * push it. Network failure leaves local untouched and reports 'offline'.
   */
  async sync(code: string, storage: StorageLike): Promise<SyncOutcome> {
    let remote: ProgressSnapshot | null;
    try {
      remote = await this.pull(code);
    } catch (err) {
      if (err instanceof SyncDecryptError) throw err;
      return { status: 'offline', pulledRemote: false, changedLocal: false };
    }

    const local = collectSnapshot(storage);
    const merged = remote ? mergeSnapshots(local, remote) : local;
    const changedLocal = remote ? JSON.stringify(merged) !== JSON.stringify(local) : false;
    if (changedLocal) applySnapshot(storage, merged);

    try {
      await this.push(code, merged);
    } catch {
      return { status: 'offline', pulledRemote: remote != null, changedLocal };
    }
    return { status: remote ? 'synced' : 'pushed-new', pulledRemote: remote != null, changedLocal };
  }
}

/** The configured sync endpoint, or null when sync is not wired for this build. */
export function syncBaseUrl(): string | null {
  const url = import.meta.env?.VITE_SYNC_URL;
  return typeof url === 'string' && url.length > 0 ? url : null;
}
