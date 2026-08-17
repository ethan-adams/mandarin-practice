<script lang="ts">
  import { onMount } from 'svelte';
  import { theme } from './lib/stores/theme';
  import { MandarinPractice } from './lib/mandarin';

  // The color tokens in app.css are keyed on the [data-theme] attribute, so it
  // has to be set before the first paint and kept in sync with the store.
  onMount(() => {
    document.documentElement.setAttribute('data-theme', $theme);
  });

  $effect(() => {
    document.documentElement.setAttribute('data-theme', $theme);
  });
</script>

<main>
  <div class="theme-bar">
    <button class="theme-button" type="button" onclick={() => theme.toggle()} aria-label="Toggle color theme">
      {$theme === 'light' ? 'Dark' : 'Light'}
    </button>
  </div>

  <div class="practice-stage">
    <MandarinPractice />
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    padding: 12px 0 24px;
    background: var(--bg-primary);
    color: var(--text-primary);
  }

  .theme-bar {
    display: flex;
    justify-content: flex-end;
    width: min(1280px, calc(100% - 24px));
    margin: 0 auto 4px;
  }

  .theme-button {
    height: 36px;
    padding: 0 14px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-secondary);
    color: var(--text-secondary);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .theme-button:hover {
    color: var(--text-primary);
  }

  .practice-stage {
    width: min(1280px, calc(100% - 24px));
    margin-inline: auto;
  }
</style>
