// Talks to mandarin-api for accounts + server-owned progress (2026-08-20 pivot).
// Replaces the old encrypted sync-code client. The server owns the canonical
// snapshot and merges on write (never clobber), so a sync is: collect local →
// PUT → apply the merged result the server returns.

import { API_BASE } from '../config';
import {
  applySnapshot,
  collectSnapshot,
  type ProgressSnapshot,
  type StorageLike,
} from '../sync/snapshot';

export type AuthResult = { token: string; email: string };

/** The saved session is no longer valid (expired/revoked); the caller re-signs in. */
export class AuthExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.');
    this.name = 'AuthExpiredError';
  }
}

function url(path: string): string {
  return `${API_BASE}${path}`;
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(url(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function register(email: string, password: string): Promise<AuthResult> {
  const res = await postJson('/v1/auth/register', { email, password });
  if (res.status === 409) throw new Error('That email is already registered — sign in instead.');
  if (res.status === 422) throw new Error('Enter a valid email and a password of at least 8 characters.');
  if (!res.ok) throw new Error('Could not create your account. Try again.');
  return (await res.json()) as AuthResult;
}

export async function login(email: string, password: string): Promise<AuthResult> {
  const res = await postJson('/v1/auth/login', { email, password });
  if (res.status === 401) throw new Error('Wrong email or password.');
  if (!res.ok) throw new Error('Could not sign in. Try again.');
  return (await res.json()) as AuthResult;
}

async function putProgress(token: string, snapshot: ProgressSnapshot): Promise<ProgressSnapshot> {
  const res = await fetch(url('/v1/progress'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ snapshot }),
  });
  if (res.status === 401) throw new AuthExpiredError();
  if (!res.ok) throw new Error(`Progress sync failed (${res.status})`);
  return ((await res.json()) as { snapshot: ProgressSnapshot }).snapshot;
}

// Compare the meaningful fields (ignore the always-fresh updatedAt) to decide
// whether the server had newer data worth reloading into the running app.
function meaningfulKey(s: ProgressSnapshot): string {
  return JSON.stringify([
    s.reviewState,
    s.practiceDays,
    s.listeningResults,
    s.listeningCount,
    s.pronunciationEvidence,
  ]);
}

/**
 * Push local progress to the account (the server merges) and apply the merged
 * result back to local storage. Returns whether local storage actually changed.
 */
export async function syncProgress(
  token: string,
  storage: StorageLike,
): Promise<{ changedLocal: boolean }> {
  const local = collectSnapshot(storage);
  const merged = await putProgress(token, local);
  const changedLocal = meaningfulKey(merged) !== meaningfulKey(local);
  if (changedLocal) applySnapshot(storage, merged);
  return { changedLocal };
}
