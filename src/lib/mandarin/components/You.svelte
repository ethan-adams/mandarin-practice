<script lang="ts">
  import type { AccountController } from '../../account/accountController.svelte';
  import type { PracticeSettings } from '../state/settings.svelte';
  import AccountPanel from './AccountPanel.svelte';

  let {
    account,
    settings,
    onResetProgress,
    onClearEvidence,
    infoLine,
  }: {
    account: AccountController;
    settings: PracticeSettings;
    onResetProgress: () => void;
    onClearEvidence: () => void;
    infoLine: string;
  } = $props();

  // Reset wipes real progress, so it takes a deliberate second tap.
  let confirmingReset = $state(false);
  function reset() {
    if (!confirmingReset) {
      confirmingReset = true;
      return;
    }
    onResetProgress();
    confirmingReset = false;
  }
</script>

<div class="you">
  <header class="you-head">
    <span class="kicker">You</span>
    <h2>Your account &amp; preferences</h2>
  </header>

  <AccountPanel {account} />

  <section class="prefs" aria-label="Display and sound">
    <h3>Display &amp; sound</h3>
    <label class="pref">
      <span><strong>Pinyin</strong><small>Show romanized pronunciation under answers</small></span>
      <input type="checkbox" bind:checked={settings.showPinyin} />
    </label>
    <label class="pref">
      <span><strong>Tone colors</strong><small>Tint pinyin by tone</small></span>
      <input type="checkbox" bind:checked={settings.toneColors} />
    </label>
    <label class="pref">
      <span><strong>Play audio</strong><small>Speak the answer automatically on reveal</small></span>
      <input type="checkbox" bind:checked={settings.autoSpeak} />
    </label>
  </section>

  <section class="data" aria-label="Your data">
    <h3>Your data</h3>
    <div class="data-row">
      <div>
        <strong>Reset progress</strong>
        <small>Clears every card's review history on this device.</small>
      </div>
      <div class="data-actions">
        {#if confirmingReset}
          <button class="danger" onclick={reset}>Really reset?</button>
          <button class="ghost" onclick={() => (confirmingReset = false)}>Cancel</button>
        {:else}
          <button class="ghost" onclick={reset}>Reset</button>
        {/if}
      </div>
    </div>
    <div class="data-row">
      <div>
        <strong>Clear pronunciation notes</strong>
        <small>Forgets the local tone/word attempts used to suggest contrasts.</small>
      </div>
      <div class="data-actions">
        <button class="ghost" onclick={onClearEvidence}>Clear</button>
      </div>
    </div>
    <p class="info">{infoLine}</p>
  </section>
</div>

<style>
  .you {
    display: grid;
    gap: 20px;
    max-width: 760px;
    margin: 0 auto;
  }

  .you-head {
    display: grid;
    gap: 4px;
  }

  .kicker {
    color: var(--accent-primary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .you-head h2 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: clamp(20px, 2.6vw, 28px);
    font-weight: 800;
  }

  /* The embedded AccountPanel keeps its own card; strip its top margin so it
     sits flush in this stacked layout. */
  .you :global(.sync-panel) {
    margin: 0;
    max-width: none;
  }

  .prefs,
  .data {
    display: grid;
    gap: 10px;
    padding: 18px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius, 12px);
    background: var(--mandarin-raised);
  }

  h3 {
    margin: 0 0 2px;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: 15px;
    font-weight: 800;
  }

  .pref {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    min-height: 48px;
    padding: 6px 0;
    border-top: 1px solid var(--border-primary);
    cursor: pointer;
  }
  .pref:first-of-type {
    border-top: 0;
  }

  .pref span {
    display: grid;
    gap: 1px;
  }
  .pref strong {
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
  }
  .pref small,
  .data-row small {
    color: var(--text-secondary);
    font-size: 12px;
  }

  .pref input {
    width: 20px;
    height: 20px;
    flex: 0 0 auto;
    accent-color: var(--accent-primary);
  }

  .data-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 8px 0;
    border-top: 1px solid var(--border-primary);
  }
  .data-row:first-of-type {
    border-top: 0;
  }
  .data-row strong {
    display: block;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 700;
  }

  .data-actions {
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
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

  .ghost {
    border: 1px solid var(--border-primary);
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }
  .ghost:hover {
    border-color: var(--accent-primary);
  }

  .danger {
    background: var(--mandarin-red);
    color: #fff;
  }

  .info {
    margin: 4px 0 0;
    color: var(--text-tertiary);
    font-size: 12px;
  }

  @media (max-width: 480px) {
    .data-row {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
