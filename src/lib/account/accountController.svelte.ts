// UI-facing state for accounts + server-owned progress. Mirrors the old
// SyncController's shape (status/message/onApplied reload) but backed by
// mandarin-api accounts instead of an encrypted sync code. Owns no progress data
// itself — it reconciles localStorage with the account and asks the app to
// re-hydrate via onApplied.

import { AuthExpiredError, login, register, syncProgress } from './progressClient';
import { API_BASE } from '../config';

const TOKEN_KEY = 'mandarin-account-token-v1';
const EMAIL_KEY = 'mandarin-account-email-v1';
const LAST_KEY = 'mandarin-account-last-v1';

export type AccountStatus = 'idle' | 'working' | 'ok' | 'offline' | 'error';

export class AccountController {
  email = $state('');
  status = $state<AccountStatus>('idle');
  message = $state('');
  lastSyncedAt = $state<string | null>(null);

  #token = $state<string | null>(null);
  signedIn = $derived(this.#token !== null);

  /** Whether an account backend is configured for this build at all. */
  readonly available: boolean;
  readonly #onApplied: () => void;

  constructor(onApplied: () => void) {
    this.#onApplied = onApplied;
    this.available = Boolean(API_BASE);
  }

  /** Restore a saved session and sync once if signed in. */
  load() {
    this.#token = localStorage.getItem(TOKEN_KEY);
    this.email = localStorage.getItem(EMAIL_KEY) ?? '';
    this.lastSyncedAt = localStorage.getItem(LAST_KEY);
    if (this.available && this.#token) void this.syncNow();
  }

  async register(email: string, password: string): Promise<void> {
    await this.#authenticate(() => register(email, password));
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.#authenticate(() => login(email, password));
  }

  async #authenticate(fn: () => Promise<{ token: string; email: string }>): Promise<void> {
    if (!this.available) {
      this.status = 'error';
      this.message = 'Accounts aren’t available right now — your progress is still saved on this device.';
      return;
    }
    this.status = 'working';
    this.message = '';
    try {
      const { token, email } = await fn();
      this.#token = token;
      this.email = email;
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(EMAIL_KEY, email);
      // Carry this device's local progress up into the account, and pull anything newer down.
      await this.syncNow();
    } catch (err) {
      this.status = 'error';
      this.message = err instanceof Error ? err.message : 'Something went wrong. Try again.';
    }
  }

  /** Sign out. Local progress stays on this device; the account copy remains. */
  signOut() {
    this.#token = null;
    this.email = '';
    this.lastSyncedAt = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(LAST_KEY);
    this.status = 'idle';
    this.message = '';
  }

  async syncNow(): Promise<void> {
    if (!this.available || !this.#token) return;
    this.status = 'working';
    this.message = '';
    try {
      const { changedLocal } = await syncProgress(this.#token, localStorage);
      if (changedLocal) this.#onApplied();
      this.status = 'ok';
      this.lastSyncedAt = new Date().toISOString();
      localStorage.setItem(LAST_KEY, this.lastSyncedAt);
      this.message = 'Progress saved to your account.';
    } catch (err) {
      if (err instanceof AuthExpiredError) {
        this.signOut();
        this.status = 'error';
        this.message = 'Your session expired — sign in again to keep saving.';
        return;
      }
      this.status = 'offline';
      this.message = 'Saved on this device. Couldn’t reach your account — will retry next time.';
    }
  }
}
