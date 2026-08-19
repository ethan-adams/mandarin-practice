// UI-facing state for progress sync: holds the persisted sync code, drives the
// SyncClient, and reports status to the Sync panel. The controller owns no
// progress data itself — it reconciles localStorage and then asks the app to
// reload its in-memory state via the injected onApplied callback.

import { generateSyncCode, normalizeSyncCode } from './crypto';
import { SyncClient, SyncDecryptError, syncBaseUrl } from './syncClient';

const CODE_KEY = 'mandarin-sync-code-v1';
const LAST_KEY = 'mandarin-sync-last-v1';

export type SyncUiStatus = 'idle' | 'syncing' | 'ok' | 'offline' | 'error';

export class SyncController {
  code = $state('');
  status = $state<SyncUiStatus>('idle');
  message = $state('');
  lastSyncedAt = $state<string | null>(null);

  linked = $derived(this.code.length > 0);
  /** Whether a sync endpoint is configured for this build at all. */
  readonly available: boolean;

  readonly #client: SyncClient | null;
  readonly #onApplied: () => void;

  constructor(onApplied: () => void) {
    this.#onApplied = onApplied;
    const base = syncBaseUrl();
    this.#client = base ? new SyncClient({ baseUrl: base }) : null;
    this.available = this.#client != null;
  }

  /** Load the persisted code; auto-sync once if this device is already linked. */
  load() {
    this.code = localStorage.getItem(CODE_KEY) ?? '';
    this.lastSyncedAt = localStorage.getItem(LAST_KEY);
    if (this.available && this.linked) void this.syncNow();
  }

  /** Begin syncing this device under a brand-new code. Copy it to link other devices. */
  async startNewSync(): Promise<void> {
    this.#setCode(generateSyncCode());
    await this.syncNow();
  }

  /** Link this device to an existing code (pulls and merges that history in). */
  async linkExistingCode(raw: string): Promise<void> {
    const code = normalizeSyncCode(raw);
    if (!code) {
      this.status = 'error';
      this.message = 'Enter a sync code.';
      return;
    }
    this.#setCode(code);
    await this.syncNow();
  }

  /** Stop syncing on this device. Local progress is untouched; the server copy remains. */
  unlink() {
    this.code = '';
    this.lastSyncedAt = null;
    localStorage.removeItem(CODE_KEY);
    localStorage.removeItem(LAST_KEY);
    this.status = 'idle';
    this.message = '';
  }

  async syncNow(): Promise<void> {
    if (!this.#client || !this.linked) return;
    this.status = 'syncing';
    this.message = '';
    try {
      const outcome = await this.#client.sync(this.code, localStorage);
      if (outcome.changedLocal) this.#onApplied();
      if (outcome.status === 'offline') {
        this.status = 'offline';
        this.message = 'Saved locally. Could not reach the sync server — will retry next time.';
        return;
      }
      this.status = 'ok';
      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem(LAST_KEY, this.lastSyncedAt);
      this.message = outcome.pulledRemote ? 'Progress synced.' : 'This device is now backing up.';
    } catch (err) {
      this.status = 'error';
      this.message = err instanceof SyncDecryptError
        ? 'That code has data we could not read. Double-check it, or start a new sync.'
        : 'Sync failed. Your progress is still saved on this device.';
    }
  }

  #setCode(code: string) {
    this.code = code;
    localStorage.setItem(CODE_KEY, code);
  }
}
