<script lang="ts">
  import type { ListeningStore } from '../state/listening.svelte';
  import type { Card } from '../logic/deck';

  let {
    listening,
    onPlayTarget,
    onNext,
  }: {
    listening: ListeningStore;
    onPlayTarget: () => void;
    onNext: () => void;
  } = $props();

  function optionState(card: Card): 'idle' | 'correct' | 'wrong' {
    const round = listening.round;
    if (!round || !round.selectedId) return 'idle';
    if (card.id === round.targetId) return 'correct';
    if (card.id === round.selectedId) return 'wrong';
    return 'idle';
  }

  let accuracy = $derived(listening.completed > 0 ? `${Math.round((listening.correct / listening.completed) * 100)}%` : '—');
</script>

<section class="listening" aria-labelledby="listening-title">
  <div class="card-meta">
    <span>Listening</span>
    <span>{listening.completed} done</span>
    <span>{accuracy} correct</span>
  </div>

  <div class="heading">
    <div>
      <span class="prompt-label">Listening exercise</span>
      <h2 id="listening-title">Which word did you hear?</h2>
    </div>
    <button class="play-button" onclick={onPlayTarget} aria-label="Play the audio again" disabled={!listening.target}>▶</button>
  </div>

  {#if !listening.round || listening.options.length < 2}
    <p class="muted">Not enough cards with audio here to build a listening round. Pick a fuller lesson or All.</p>
  {:else}
    <p class="muted">Tap play, then choose the word you heard.</p>
    {#if listening.round.audioUnavailable}
      <p class="audio-unavailable" role="status">Audio is muted in this browser. You can still reveal the answer or head back to card practice.</p>
    {/if}

    <div class="choices" role="group" aria-label="Listening answer choices">
      {#each listening.options as card, i (card.id)}
        <button
          data-state={optionState(card)}
          aria-label={`Choice ${i + 1}: ${card.answerZh}, ${card.pinyin}, ${card.promptEn}`}
          onclick={() => listening.choose(card.id)}
          disabled={listening.revealed}
        >
          <strong lang="zh-CN">{card.answerZh}</strong>
          <span>{card.pinyin}</span>
          <small>{card.promptEn}</small>
        </button>
      {/each}
    </div>

    {#if listening.revealed}
      <div class="result" data-correct={listening.correctAnswer} aria-live="polite">
        <strong>{listening.correctAnswer ? 'Correct' : 'Not this time'}</strong>
        {#if listening.target}
          <span>You heard <b lang="zh-CN">{listening.target.answerZh}</b> · {listening.target.pinyin} · {listening.target.promptEn}.</span>
        {/if}
      </div>
      <div class="next-row">
        <button class="next" onclick={onNext}>Next</button>
        <small class="keyboard-hint">Enter next · R replay</small>
      </div>
    {:else}
      <small class="keyboard-hint">R replay · 1–4 choose</small>
    {/if}
  {/if}
</section>

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .listening {
    display: grid;
    gap: 18px;
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    gap: 14px;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
    text-transform: uppercase;
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

  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .heading h2 {
    margin: 0;
    font-size: clamp(28px, 4vw, 48px);
    line-height: 1.05;
  }

  .muted {
    margin: 0;
    color: var(--text-secondary);
  }

  .play-button {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--mandarin-red);
    color: white;
    font-size: 17px;
  }
  .play-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .choices {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .choices button {
    display: grid;
    gap: 5px;
    min-height: 120px;
    padding: 16px;
    border: 2px solid var(--border-primary);
    background: color-mix(in srgb, var(--bg-primary) 76%, var(--bg-secondary));
    color: var(--text-primary);
    text-align: left;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .choices button:not(:disabled):hover {
    border-color: var(--accent-primary);
  }
  .choices button[data-state='correct'] {
    border-color: #2f7d52;
    background: color-mix(in srgb, #2f7d52 14%, var(--bg-primary));
  }
  .choices button[data-state='wrong'] {
    border-color: var(--mandarin-red);
    background: color-mix(in srgb, var(--mandarin-red) 12%, var(--bg-primary));
  }

  .choices strong {
    font-size: 34px;
  }
  .choices span {
    font-size: 18px;
    font-weight: 780;
    color: var(--text-secondary);
  }
  .choices small {
    color: var(--text-tertiary);
  }

  .result {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 16px;
    padding: 13px 15px;
    border-left: 4px solid var(--mandarin-red);
    border-radius: 8px;
    background: color-mix(in srgb, var(--mandarin-red) 8%, var(--bg-primary));
  }
  .result[data-correct='true'] {
    border-left-color: #2f7d52;
    background: color-mix(in srgb, #2f7d52 10%, var(--bg-primary));
  }
  .result strong {
    color: var(--text-primary);
  }
  .result span {
    color: var(--text-secondary);
  }

  .next-row {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .next {
    min-height: 48px;
    padding: 0 26px;
    border-radius: 8px;
    font-weight: 840;
    background: var(--accent-primary);
    color: white;
  }

  .keyboard-hint {
    color: var(--text-tertiary);
  }

  .audio-unavailable {
    margin: 0;
    padding: 10px;
    border: 1px solid var(--accent-gold);
    border-radius: 7px;
    color: var(--text-secondary);
  }

  @media (hover: none) and (pointer: coarse) {
    .keyboard-hint {
      display: none;
    }
  }
</style>
