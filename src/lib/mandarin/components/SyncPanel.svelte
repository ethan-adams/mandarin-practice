<script lang="ts">
  import type { SyncController } from '../../sync/syncController.svelte';

  let { sync }: { sync: SyncController } = $props();

  let showLink = $state(false);
  let entered = $state('');
  let copied = $state(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(sync.code);
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context): the code is on screen to copy by hand.
    }
  }
</script>

<section class="sync-panel" aria-label="Cross-device progress sync">
  <h2>Save progress across devices</h2>

  {#if !sync.available}
    <p class="muted">Cross-device sync isn’t configured for this build. Your progress is still saved on this device.</p>
  {:else if !sync.linked}
    <p class="muted">
      Your progress is saved on this device. Turn on sync to back it up and pick up where you left off on another
      device — no account, no email.
    </p>
    <div class="row">
      <button class="primary" onclick={() => void sync.startNewSync()}>Turn on sync</button>
      <button class="ghost" onclick={() => (showLink = !showLink)}>I have a sync code</button>
    </div>
    {#if showLink}
      <div class="row">
        <input
          class="code-input"
          placeholder="xxxx-xxxx-xxxx-xxxx-xxxx"
          autocomplete="off"
          spellcheck="false"
          bind:value={entered}
        />
        <button class="primary" onclick={() => void sync.linkExistingCode(entered)}>Link this device</button>
      </div>
    {/if}
  {:else}
    <p class="muted">This device is syncing. Enter this code on another device to link it:</p>
    <div class="row code-row">
      <code class="code">{sync.code}</code>
      <button class="ghost" onclick={copyCode}>{copied ? 'Copied ✓' : 'Copy'}</button>
    </div>
    <p class="caution">Anyone with this code can read your progress. Keep it like a password.</p>
    <div class="row">
      <button class="primary" onclick={() => void sync.syncNow()} disabled={sync.status === 'syncing'}>
        {sync.status === 'syncing' ? 'Syncing…' : 'Sync now'}
      </button>
      <button class="ghost" onclick={() => sync.unlink()}>Unlink this device</button>
    </div>
  {/if}

  {#if sync.message}
    <p class="status" class:error={sync.status === 'error'} role="status">{sync.message}</p>
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

  .code-row {
    margin-top: 2px;
  }

  .code {
    padding: 7px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 15px;
    letter-spacing: 0.06em;
    user-select: all;
  }

  .code-input {
    flex: 1 1 260px;
    min-height: 40px;
    padding: 0 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
    background: var(--mandarin-red, #b3323a);
    color: #fff;
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
