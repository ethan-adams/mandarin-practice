<script lang="ts">
  import { lessonLabel } from '../logic/lessons';
  import type { PracticeSession, Mode } from '../state/session.svelte';
  import type { PracticeSettings } from '../state/settings.svelte';
  import type { SpeechController } from '../state/speech.svelte';

  let {
    session,
    settings,
    speech,
    onGoHome,
    onSetMode,
    onShowListening,
    onSelectCard,
  }: {
    session: PracticeSession;
    settings: PracticeSettings;
    speech: SpeechController;
    onGoHome: () => void;
    onSetMode: (mode: Mode) => void;
    onShowListening: () => void;
    onSelectCard: (index: number) => void;
  } = $props();
</script>

<aside class="lesson-panel" aria-label="Practice controls and cards">
  <div class="panel-section scope-row">
    <button class="back-button" onclick={onGoHome}>← Course</button>
    <span class="scope-label">{session.scopeLabel || 'All lessons'}</span>
  </div>

  <div class="panel-section">
    <div class="mode-control" aria-label="Practice mode">
      <button class:active={session.practiceView === 'cards' && session.mode === 'due'} onclick={() => onSetMode('due')}>Due</button>
      <button class:active={session.practiceView === 'cards' && session.mode === 'new'} onclick={() => onSetMode('new')}>New</button>
      <button class:active={session.practiceView === 'cards' && session.mode === 'all'} onclick={() => onSetMode('all')}>All</button>
      <button class:active={session.practiceView === 'listening'} onclick={onShowListening}>Listening</button>
    </div>
  </div>

  <div class="panel-section option-row">
    <label><input type="checkbox" bind:checked={settings.showPinyin} /> Pinyin</label>
    <label><input type="checkbox" bind:checked={settings.toneColors} /> Tones</label>
    <label><input type="checkbox" bind:checked={settings.autoSpeak} /> Audio</label>
  </div>

  <div class="voice-panel">
    <div class="voice-heading">
      <span>Answer audio</span>
      <strong>{speech.lastAudioVoice || 'Plays on first answer'}</strong>
    </div>
    <div class="speech-state" data-status={speech.status} aria-live="polite">
      <small>{speech.detail}</small>
      <div class="speech-actions">
        {#if speech.status === 'error' || speech.status === 'fallback' || speech.status === 'muted'}
          <button onclick={() => speech.retryNeuralSpeech()}>Retry</button>
        {/if}
      </div>
    </div>
  </div>

  {#if session.practiceView !== 'listening'}
    <div class="lesson-list" aria-label="Cards in current session">
      <!-- Prompts only: showing the hanzi answer here would leak the answer
           for the card under test and undermine recall practice. -->
      {#each session.selectedCards as card, index}
        <button
          class:active={index === session.currentIndex}
          class:complete={(session.reviewState[card.id]?.attempts ?? 0) > 0}
          onclick={() => onSelectCard(index)}
        >
          <span class="lesson-kicker">{lessonLabel(card.lessonId)}</span>
          <strong>{card.promptEn}</strong>
        </button>
      {/each}
    </div>
  {:else}
    <div class="listening-intro">
      <span class="lesson-kicker">Listening</span>
      <strong>Hear it, pick the word</strong>
      <small>Native audio from this lesson. Doesn't change your card scheduling.</small>
    </div>
  {/if}
</aside>

<style>
  .lesson-panel {
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--mandarin-raised);
    box-shadow: var(--shadow-sm);
    overflow: hidden;
  }

  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .panel-section {
    padding: 10px;
    border-bottom: 1px solid var(--border-primary);
  }

  .scope-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .back-button {
    flex: 0 0 auto;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--border-primary);
    background: color-mix(in srgb, var(--bg-primary) 66%, var(--bg-secondary));
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 800;
  }

  .scope-label {
    min-width: 0;
    overflow: hidden;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 780;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mode-control {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
    padding: 4px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-primary) 72%, var(--bg-secondary));
  }

  .mode-control button {
    min-height: 38px;
    background: transparent;
    color: var(--text-secondary);
    font-weight: 760;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .mode-control button.active {
    background: var(--mandarin-red);
    color: white;
  }

  .option-row {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .option-row label {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 38px;
    padding: 0 8px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg-primary) 66%, var(--bg-secondary));
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 780;
  }

  .option-row input {
    accent-color: var(--mandarin-red);
  }

  .voice-panel {
    display: grid;
    gap: 5px;
    padding: 12px;
    border-bottom: 1px solid var(--border-primary);
    background: color-mix(in srgb, var(--mandarin-red) 7%, var(--bg-primary));
  }

  .voice-panel span {
    display: block;
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 840;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .voice-panel strong {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 780;
    line-height: 1.3;
  }

  .voice-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .voice-heading strong {
    text-align: right;
  }

  .speech-state {
    display: grid;
    gap: 6px;
    margin-top: 3px;
  }

  .speech-state small {
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.35;
  }

  .speech-state[data-status='error'] small,
  .speech-state[data-status='fallback'] small,
  .speech-state[data-status='muted'] small {
    color: var(--mandarin-gold);
  }

  .speech-actions {
    display: flex;
    gap: 6px;
  }

  .speech-actions button {
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-primary);
    border-radius: 5px;
    background: var(--bg-primary);
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 760;
  }

  .lesson-list {
    max-height: calc(100vh - 282px);
    overflow: auto;
    padding: 10px;
  }

  .lesson-list button {
    width: 100%;
    min-height: 68px;
    margin-bottom: 9px;
    padding: 13px;
    border: 1px solid var(--border-primary);
    border-left: 4px solid transparent;
    border-radius: 8px;
    text-align: left;
    background: color-mix(in srgb, var(--bg-primary) 72%, var(--bg-secondary));
    color: var(--text-primary);
    transition:
      border-color 120ms ease,
      background-color 120ms ease,
      transform 120ms ease;
  }

  .lesson-list button.active {
    border-color: color-mix(in srgb, var(--mandarin-red) 42%, var(--border-primary));
    border-left-color: var(--mandarin-red);
    background: color-mix(in srgb, var(--mandarin-red) 10%, var(--bg-primary));
    transform: translateX(2px);
  }

  .lesson-list button.complete {
    background-image: linear-gradient(90deg, color-mix(in srgb, #2f7d52 16%, transparent), transparent);
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

  .lesson-list strong {
    display: block;
    font-size: 14px;
    line-height: 1.35;
  }

  .listening-intro {
    display: grid;
    gap: 7px;
    margin: 10px;
    padding: 12px;
    border: 1px solid color-mix(in srgb, var(--mandarin-gold) 45%, var(--border-primary));
    border-radius: 8px;
    background: color-mix(in srgb, var(--mandarin-gold) 9%, var(--bg-primary));
  }

  .listening-intro small {
    color: var(--text-secondary);
    line-height: 1.4;
  }

  @media (max-width: 920px) {
    .lesson-list {
      max-height: 260px;
    }
  }

  @media (max-width: 560px) {
    .option-row {
      grid-template-columns: 1fr;
    }

    .mode-control {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
