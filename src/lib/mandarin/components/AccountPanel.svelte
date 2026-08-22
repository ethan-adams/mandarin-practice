<script lang="ts">
  import type { AccountController } from '../../account/accountController.svelte';

  let { account }: { account: AccountController } = $props();

  let email = $state('');
  let password = $state('');

  const busy = $derived(account.status === 'working');

  function friendlyLastSynced(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return `Last saved ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
</script>

<section class="sync-panel" aria-label="Save progress to your account">
  <h2>Save progress across devices</h2>

  {#if !account.available}
    <p class="muted">Accounts aren’t set up for this build. Your progress is still saved on this device.</p>
  {:else if !account.signedIn}
    <p class="muted">
      Your progress is saved on this device. Create an account to keep it safe and pick up where you left off on
      any device.
    </p>
    <form
      class="row"
      onsubmit={(e) => {
        e.preventDefault();
        void account.signIn(email, password);
      }}
    >
      <input
        class="field"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
        bind:value={email}
        required
      />
      <input
        class="field"
        type="password"
        placeholder="Password"
        autocomplete="current-password"
        bind:value={password}
        required
      />
      <button class="primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Sign in'}</button>
      <button class="ghost" type="button" disabled={busy} onclick={() => void account.register(email, password)}>
        Create account
      </button>
    </form>
    <p class="caution">New here? Enter an email and a password (8+ characters), then “Create account”.</p>
  {:else}
    <p class="muted">Signed in as <strong>{account.email}</strong>. Your progress saves to your account automatically.</p>
    <div class="row">
      <button class="primary" onclick={() => void account.syncNow()} disabled={busy}>
        {busy ? 'Saving…' : 'Save now'}
      </button>
      <button class="ghost" onclick={() => account.signOut()}>Sign out</button>
      {#if account.lastSyncedAt}<span class="caution">{friendlyLastSynced(account.lastSyncedAt)}</span>{/if}
    </div>
  {/if}

  {#if account.message}
    <p class="status" class:error={account.status === 'error'} role="status">{account.message}</p>
  {/if}
</section>

<style>
  .sync-panel {
    max-width: 1280px;
    margin: 18px auto 0;
    padding: 16px 18px;
    border: 1px solid var(--border-primary);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
  }

  .sync-panel h2 {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 820;
    letter-spacing: 0.01em;
    color: var(--text-primary);
  }

  .muted {
    margin: 0 0 12px;
    max-width: 62ch;
    color: var(--text-secondary);
    font-size: 13.5px;
    line-height: 1.5;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
  }

  .field {
    flex: 1 1 200px;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font: inherit;
    font-size: 14px;
  }

  button {
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
  }

  button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .primary {
    background: var(--accent-primary);
    color: #fff;
  }
  .primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .ghost {
    border: 1px solid var(--border-primary);
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .caution {
    margin: 10px 0 0;
    color: var(--text-secondary);
    font-size: 12px;
  }

  .status {
    margin: 12px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .status.error {
    color: var(--mandarin-red, #b3323a);
  }
</style>
