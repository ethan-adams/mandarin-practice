<script lang="ts">
  import { TONE_FEEDBACK_EXPERIMENTAL } from '../../utils/mandarinToneAssessment';
  import type { ToneCoachController } from '../state/toneCoach.svelte';

  let {
    toneCoach,
    answerRevealed,
  }: {
    toneCoach: ToneCoachController;
    answerRevealed: boolean;
  } = $props();

  let hasVerdict = $derived(!toneCoach.toneAssessmentActive && (toneCoach.wordVerdict !== null || toneCoach.toneVerdict !== null));
</script>

<div class="verdict-card" data-status={toneCoach.feedbackAccent} aria-live="polite">
  {#if toneCoach.toneAssessmentActive}
    <div class="listening">
      <span class="pulse" aria-hidden="true"></span>
      <div>
        <strong>Listening…</strong>
        <small>Say the answer naturally, then it reads back how close you were.</small>
      </div>
    </div>
  {:else if hasVerdict}
    {#if toneCoach.wordVerdict}
      <div class="line" data-status={toneCoach.wordVerdict.status}>
        <span class="key">Word</span>
        <span class="val">{toneCoach.wordVerdict.line}</span>
      </div>
    {/if}
    {#if toneCoach.toneVerdict}
      <div class="line" data-status={toneCoach.toneVerdict.status}>
        <span class="key">Tone</span>
        <span class="val">{toneCoach.toneVerdict.line}</span>
      </div>
      {#if toneCoach.toneDots.length > 1}
        <div class="dots" aria-label="Per-syllable tone match">
          {#each toneCoach.toneDots as status}
            <span data-status={status}></span>
          {/each}
        </div>
      {/if}
      {#if TONE_FEEDBACK_EXPERIMENTAL}
        <small class="hedge">Tone read is an in-browser estimate, not a grade.</small>
      {/if}
    {/if}
    {#if !toneCoach.wordAvailable}
      <small class="hedge">Word check is offline right now, so this is judged by tone alone.</small>
    {/if}
  {:else if toneCoach.toneError || toneCoach.recognitionError}
    <small class="idle">{toneCoach.toneError || toneCoach.recognitionError}</small>
  {:else}
    <small class="idle">
      {answerRevealed ? 'Tap Speak to check your word and tone against the native audio.' : 'Tap Speak and say the answer to see how close your word and tone landed.'}
    </small>
  {/if}
</div>

<style>
  .verdict-card {
    display: grid;
    gap: 10px;
    max-width: 860px;
    margin-top: 26px;
    padding: 16px;
    border: 1px solid var(--border-primary);
    border-left: 4px solid var(--border-primary);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-primary) 64%, var(--bg-secondary));
  }

  .verdict-card[data-status='match'] {
    border-left-color: #2f7d52;
  }
  .verdict-card[data-status='near'] {
    border-left-color: var(--accent-gold);
  }
  .verdict-card[data-status='off'] {
    border-left-color: var(--mandarin-red);
  }

  .line {
    display: grid;
    grid-template-columns: 54px 1fr;
    align-items: baseline;
    gap: 12px;
  }

  .key {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .val {
    color: var(--text-primary);
    font-size: 16px;
    line-height: 1.4;
  }

  .line[data-status='match'] .key {
    color: #2f7d52;
  }
  .line[data-status='near'] .key {
    color: color-mix(in srgb, var(--accent-gold) 80%, var(--text-secondary));
  }
  .line[data-status='off'] .key {
    color: var(--mandarin-red);
  }
  .line[data-status='unknown'] .val {
    color: var(--text-secondary);
  }

  .dots {
    display: grid;
    grid-auto-flow: column;
    justify-content: start;
    gap: 5px;
    margin-left: 66px;
  }

  .dots span {
    width: 26px;
    height: 5px;
    border-radius: 5px;
    background: var(--border-primary);
  }
  .dots span[data-status='matched'] {
    background: #2f7d52;
  }
  .dots span[data-status='close'] {
    background: var(--accent-gold);
  }
  .dots span[data-status='missed'] {
    background: var(--mandarin-red);
  }

  .hedge {
    color: var(--text-tertiary);
    font-size: 11px;
    line-height: 1.35;
  }

  .idle {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.4;
  }

  .listening {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .listening strong {
    display: block;
    color: var(--text-primary);
    font-size: 16px;
  }

  .listening small {
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.35;
  }

  .pulse {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--accent-primary);
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-primary) 55%, transparent);
    animation: pulse 1.4s ease-out infinite;
  }

  @keyframes pulse {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent-primary) 55%, transparent);
    }
    70% {
      box-shadow: 0 0 0 9px transparent;
    }
    100% {
      box-shadow: 0 0 0 0 transparent;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pulse {
      animation: none;
    }
  }
</style>
