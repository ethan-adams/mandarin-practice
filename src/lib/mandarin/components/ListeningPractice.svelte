<script lang="ts">
  import { MANDARIN_CONTRAST_PAIRS } from '../../utils/mandarinContrastPractice';
  import type { ListeningStore } from '../state/listening.svelte';

  let {
    listening,
    onPlayPrompt,
  }: {
    listening: ListeningStore;
    onPlayPrompt: () => void;
  } = $props();
</script>

<section class="listening-practice" aria-labelledby="listening-title">
  <div class="card-meta">
    <span>Pair {(listening.completedCount % MANDARIN_CONTRAST_PAIRS.length) + 1} of {MANDARIN_CONTRAST_PAIRS.length}</span>
    <span>{listening.currentPair.label}</span>
    <span>{listening.completedCount} completed</span>
  </div>
  <div class="listening-heading">
    <div>
      <span class="prompt-label">Listening exercise</span>
      <h2 id="listening-title">Which phrase did you hear?</h2>
    </div>
    <button class="speak-button" onclick={onPlayPrompt} aria-label="Replay listening prompt">▶</button>
  </div>
  <p>{listening.currentPair.prompt}</p>
  {#if listening.round.audioUnavailable}
    <p class="audio-unavailable" role="status">Audio is unavailable. Reveal the answer, or return to card practice; nothing is counted until you self-rate.</p>
  {/if}
  <div class="listening-choices" role="group" aria-label="Listening answer choices">
    {#each [listening.currentPair.target, listening.currentPair.contrast] as cue, choiceIndex}
      <button
        class:selected={listening.round.selectedCueId === cue.id}
        aria-pressed={listening.round.selectedCueId === cue.id}
        aria-label={`Choice ${choiceIndex + 1}: ${cue.han}, ${cue.pinyin}, ${cue.gloss}`}
        onclick={() => listening.choose(cue.id)}
        disabled={listening.round.revealed}
      >
        <strong lang="zh-CN">{cue.han}</strong>
        <span>{cue.pinyin}</span>
        <small>{cue.gloss}</small>
      </button>
    {/each}
  </div>
  {#if !listening.round.revealed}
    <button class="reveal-button listening-reveal" onclick={() => listening.reveal()} disabled={!listening.round.selectedCueId}>Reveal answer</button>
    <small class="keyboard-hint">R replay · 1/2 choose · Enter reveal</small>
  {:else}
    <div class="listening-result" data-correct={listening.round.correct} aria-live="polite">
      <strong>{listening.round.correct ? 'Correct' : 'Not this time'}</strong>
      <span>The audio was <b lang="zh-CN">{listening.currentCue.han}</b> · {listening.currentCue.pinyin} · {listening.currentCue.gloss}.</span>
    </div>
    <div class="confidence-row" aria-label="Manual listening confidence">
      <span>How confident were you?</span>
      <button onclick={() => listening.rateConfidence('low')}>Low <kbd>1</kbd></button>
      <button onclick={() => listening.rateConfidence('medium')}>Medium <kbd>2</kbd></button>
      <button onclick={() => listening.rateConfidence('high')}>High <kbd>3</kbd></button>
    </div>
  {/if}
</section>

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .listening-practice {
    display: grid;
    gap: 18px;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 28px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .card-meta span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .prompt-label {
    display: block;
    margin-bottom: 8px;
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 860;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .listening-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .listening-heading h2 {
    margin: 0;
    font-size: clamp(30px, 4vw, 52px);
    line-height: 1.05;
  }

  .listening-practice > p {
    margin: 0;
    color: var(--text-secondary);
  }

  .speak-button {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    flex: 0 0 auto;
    border: 1px solid color-mix(in srgb, var(--mandarin-red) 42%, var(--border-primary));
    background: var(--mandarin-red);
    color: white;
    font-size: 15px;
  }

  .listening-choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .listening-choices button {
    display: grid;
    gap: 5px;
    min-height: 142px;
    padding: 16px;
    border: 2px solid var(--border-primary);
    background: color-mix(in srgb, var(--bg-primary) 76%, var(--bg-secondary));
    color: var(--text-primary);
    text-align: left;
  }

  .listening-choices button.selected {
    border-color: var(--mandarin-blue);
    background: color-mix(in srgb, var(--mandarin-blue) 12%, var(--bg-primary));
  }

  .listening-choices strong {
    font-size: 34px;
  }

  .listening-choices span {
    font-size: 18px;
    font-weight: 780;
  }

  .listening-choices small,
  .keyboard-hint {
    color: var(--text-secondary);
  }

  .reveal-button {
    min-height: 48px;
    padding: 0 20px;
    border-radius: 8px;
    font-weight: 840;
    min-width: 146px;
    background: var(--mandarin-red);
    color: white;
  }

  .listening-reveal {
    justify-self: start;
  }

  .listening-reveal:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  .listening-result {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    padding: 13px;
    border-left: 4px solid var(--mandarin-red-dark);
    background: color-mix(in srgb, var(--mandarin-red) 8%, var(--bg-primary));
  }

  .listening-result[data-correct='true'] {
    border-left-color: #2f7d52;
    background: color-mix(in srgb, #2f7d52 9%, var(--bg-primary));
  }

  .confidence-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .confidence-row span {
    margin-right: 4px;
    font-weight: 780;
  }

  .confidence-row button {
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 780;
  }

  kbd {
    opacity: 0.65;
    font: inherit;
  }

  .audio-unavailable {
    padding: 10px;
    border: 1px solid var(--mandarin-gold);
    border-radius: 7px;
  }

  /* Keyboard hints are noise on touch devices that have no keyboard. */
  @media (hover: none) and (pointer: coarse) {
    .keyboard-hint {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .listening-choices {
      grid-template-columns: 1fr 1fr;
    }

    .card-meta {
      align-items: stretch;
      flex-direction: column;
      gap: 5px;
    }
  }
</style>
