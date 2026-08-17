<script lang="ts">
  import type { EvidenceStore } from '../state/evidence.svelte';

  let {
    evidence,
    onPlayDrillCue,
  }: {
    evidence: EvidenceStore;
    onPlayDrillCue: (kind: 'target' | 'contrast') => void;
  } = $props();
</script>

{#if evidence.activeDrill && evidence.activeDrillPair && evidence.activeDrill.step !== 'complete'}
  <div class="contrast-drill" aria-live="polite">
    <div>
      <span class="lesson-kicker">Optional drill · {evidence.activeDrillPair.label}</span>
      <strong>{evidence.activeDrillPair.target.han} {evidence.activeDrillPair.target.pinyin} / {evidence.activeDrillPair.contrast.han} {evidence.activeDrillPair.contrast.pinyin}</strong>
    </div>
    {#if evidence.activeDrill.step === 'hear_target'}
      <p>First, hear the target.</p>
      <button onclick={() => onPlayDrillCue('target')}>Hear target</button>
    {:else if evidence.activeDrill.step === 'hear_contrast'}
      <p>Now hear the contrast.</p>
      <button onclick={() => onPlayDrillCue('contrast')}>Hear contrast</button>
    {:else if evidence.activeDrill.step === 'speak_target'}
      <p>Say <b lang="zh-CN">{evidence.activeDrillPair.target.han}</b> ({evidence.activeDrillPair.target.pinyin}), then continue. Audio is not recorded or stored.</p>
      <button onclick={() => evidence.updateDrill('spoke')}>I spoke the target</button>
    {:else if evidence.activeDrill.step === 'rate'}
      <p>Rate your own attempt. This never changes card scheduling.</p>
      <div class="drill-ratings">
        <button onclick={() => evidence.updateDrill('wrong')}>Again</button>
        <button onclick={() => evidence.updateDrill('hard')}>Hard</button>
        <button onclick={() => evidence.updateDrill('correct')}>Good</button>
      </div>
    {/if}
    <div class="drill-secondary">
      <button onclick={() => evidence.updateDrill('retry')}>Restart</button>
      <button onclick={() => evidence.updateDrill('skip')}>Skip</button>
    </div>
  </div>
{:else if evidence.activeDrill?.step === 'complete'}
  <div class="contrast-drill complete" aria-live="polite">
    <strong>{evidence.activeDrill.rating ? 'Contrast drill complete.' : 'Contrast drill skipped.'}</strong>
    <button onclick={() => evidence.closeDrill()}>Close</button>
  </div>
{/if}

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .lesson-kicker {
    display: block;
    margin-bottom: 5px;
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .contrast-drill {
    display: grid;
    gap: 8px;
    max-width: 860px;
    margin-top: 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--mandarin-blue) 40%, var(--border-primary));
    border-radius: 8px;
    background: color-mix(in srgb, var(--mandarin-blue) 8%, var(--bg-primary));
  }

  .contrast-drill p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .drill-ratings,
  .drill-secondary {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .contrast-drill button {
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 780;
  }

  .drill-secondary {
    margin-top: 2px;
  }

  .drill-secondary button {
    color: var(--text-secondary);
  }

  .contrast-drill.complete {
    grid-template-columns: 1fr auto;
    align-items: center;
  }
</style>
