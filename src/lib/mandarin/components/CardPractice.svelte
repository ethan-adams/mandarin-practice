<script lang="ts">
  import { lessonLabel } from '../logic/lessons';
  import { pinyinParts, pinyinText } from '../logic/pinyin';
  import type { Rating } from '../logic/srs';
  import type { PracticeSession } from '../state/session.svelte';
  import type { PracticeSettings } from '../state/settings.svelte';
  import type { SpeechController } from '../state/speech.svelte';
  import type { ToneCoachController } from '../state/toneCoach.svelte';
  import type { EvidenceStore } from '../state/evidence.svelte';
  import ToneCoachPanel from './ToneCoachPanel.svelte';
  import ContrastDrillPanel from './ContrastDrillPanel.svelte';

  let {
    session,
    settings,
    speech,
    toneCoach,
    evidence,
    onRate,
    onReveal,
    onBeginDrill,
    onPlayDrillCue,
  }: {
    session: PracticeSession;
    settings: PracticeSettings;
    speech: SpeechController;
    toneCoach: ToneCoachController;
    evidence: EvidenceStore;
    onRate: (rating: Rating) => void;
    onReveal: () => void;
    onBeginDrill: (pairId: string) => void;
    onPlayDrillCue: (kind: 'target' | 'contrast') => void;
  } = $props();

  let currentCard = $derived(session.currentCard);
  let currentPinyin = $derived(currentCard ? pinyinText(currentCard.pinyin) : '');
  let currentParts = $derived(currentCard ? pinyinParts(currentCard.pinyin) : []);
</script>

{#if currentCard}
  <div class="progress-track" aria-label="Session progress">
    <span style={`width: ${session.sessionProgress}%`}></span>
  </div>

  <div class="card-meta">
    {#if session.sessionActive}
      <span>Card {Math.min(session.sessionRatings.length + 1, session.sessionPlanned)} of {session.sessionPlanned} this session</span>
    {:else}
      <span>Card {session.currentIndex + 1} of {session.selectedCards.length}</span>
    {/if}
    <span>{lessonLabel(currentCard.lessonId)}</span>
    <span>{session.currentState?.attempts ?? 0} attempts</span>
  </div>

  <div class="prompt-block">
    <span class="prompt-label">Prompt</span>
    <p class="prompt">{currentCard.promptEn}</p>
  </div>

  <ToneCoachPanel {toneCoach} {settings} answerRevealed={session.showAnswer} />

  {#if toneCoach.explanation && toneCoach.contrastPair}
    {@const contrastPair = toneCoach.contrastPair}
    <div class="pronunciation-next-action" aria-label={toneCoach.explanation.ariaLabel}>
      <span class="lesson-kicker">Next action · {contrastPair.label}</span>
      <strong>{toneCoach.explanation.title}</strong>
      <p>{toneCoach.explanation.detail}</p>
      <small>{contrastPair.prompt}</small>
      <div>
        <button aria-label={`Hear target ${contrastPair.target.han}, ${contrastPair.target.pinyin}`} onclick={() => void speech.playContrastCue(contrastPair.target)}>Hear target</button>
        <button aria-label={`Hear contrast ${contrastPair.contrast.han}, ${contrastPair.contrast.pinyin}`} onclick={() => void speech.playContrastCue(contrastPair.contrast)}>Hear contrast</button>
        <button onclick={() => onBeginDrill(contrastPair.id)}>Practice this contrast</button>
        <button onclick={() => void toneCoach.startAssessment()} disabled={!toneCoach.microphoneAvailable}>Try again</button>
      </div>
    </div>
  {/if}

  <ContrastDrillPanel {evidence} {onPlayDrillCue} />

  {#if session.showAnswer}
    <div class="answer">
      <div class="answer-topline">
        <div>
          <span class="prompt-label">Answer</span>
          <p lang="zh-CN">{currentCard.answerZh}</p>
        </div>
        <button
          class="speak-button"
          onclick={() => void speech.speakAnswer()}
          aria-label="Replay answer"
          disabled={speech.status === 'loading' || speech.status === 'synthesizing'}
        >
          {speech.status === 'loading' || speech.status === 'synthesizing' ? '…' : '▶'}
        </button>
      </div>
      {#if speech.lastAudioVoice}
        <div class="voice-chip">
          <strong>Voice</strong>
          <span>{speech.lastAudioVoice}{speech.backend ? ` · ${speech.backend.toUpperCase()}` : ''}</span>
        </div>
      {/if}

      {#if settings.showPinyin}
        <div class="pinyin-line" aria-label={currentPinyin}>
          {#each currentParts as part}
            {#if part.syllable}
              <span class:tone-colors={settings.toneColors} data-tone={part.tone}>{part.text}</span>
            {:else}
              <span>{part.text}</span>
            {/if}
          {/each}
        </div>
      {/if}

      {#if currentCard.notes}<small class="note">{currentCard.notes}</small>{/if}
    </div>

    <div class="rating-row">
      <button class="wrong" onclick={() => onRate('wrong')}>Again</button>
      <button class="hard" onclick={() => onRate('hard')}>Hard</button>
      <button class="correct" onclick={() => onRate('correct')}>Correct</button>
    </div>
  {:else}
    <div class="prompt-actions">
      <button
        class="listen-button"
        onclick={toneCoach.toneAssessmentActive ? () => toneCoach.stopToneAssessment(true) : () => void toneCoach.startAssessment()}
        disabled={!toneCoach.microphoneAvailable && !toneCoach.toneAssessmentActive}
      >
        {toneCoach.toneAssessmentActive ? 'Stop' : 'Speak'}
      </button>
      <button class="reveal-button" onclick={onReveal}>Reveal</button>
    </div>
  {/if}
{/if}

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .progress-track {
    height: 9px;
    overflow: hidden;
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-tertiary) 84%, var(--bg-primary));
    margin-bottom: 24px;
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, var(--mandarin-red), var(--mandarin-gold));
    transition: width 160ms ease;
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

  .prompt-block {
    max-width: 860px;
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

  .prompt {
    max-width: 780px;
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(30px, 4vw, 56px);
    line-height: 1.04;
    font-weight: 860;
  }

  .answer {
    margin-top: 34px;
    border-top: 1px solid var(--border-primary);
    padding-top: 28px;
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

  .pronunciation-next-action {
    display: grid;
    gap: 8px;
    max-width: 860px;
    margin-top: 12px;
    padding: 13px;
    border: 1px solid color-mix(in srgb, var(--mandarin-blue) 40%, var(--border-primary));
    border-radius: 8px;
    background: color-mix(in srgb, var(--mandarin-blue) 8%, var(--bg-primary));
  }

  .pronunciation-next-action p {
    margin: 0;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .pronunciation-next-action > small {
    color: var(--text-secondary);
  }

  .pronunciation-next-action > div {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .pronunciation-next-action button {
    min-height: 36px;
    padding: 0 11px;
    border: 1px solid var(--border-primary);
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 12px;
    font-weight: 780;
  }

  .answer-topline {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 18px;
  }

  .answer p {
    margin: 0 0 10px;
    color: var(--text-primary);
    font-size: clamp(50px, 7.8vw, 104px);
    line-height: 1;
    font-weight: 880;
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

  .speak-button:disabled {
    cursor: wait;
    opacity: 0.68;
  }

  .voice-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    padding: 6px 9px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 730;
  }

  .voice-chip strong {
    color: var(--text-primary);
  }

  .pinyin-line {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 9px;
    color: var(--text-secondary);
    font-size: clamp(15px, 1.5vw, 20px);
    line-height: 1.36;
    font-weight: 720;
    opacity: 0.76;
  }

  .pinyin-line span {
    white-space: pre;
  }

  .tone-colors[data-tone='1'] {
    color: #1f7a5c;
  }

  .tone-colors[data-tone='2'] {
    color: var(--mandarin-blue);
  }

  .tone-colors[data-tone='3'] {
    color: #8a4db3;
  }

  .tone-colors[data-tone='4'] {
    color: var(--mandarin-red);
  }

  .note {
    display: block;
    max-width: 720px;
    margin-top: 14px;
    color: var(--text-secondary);
    font-size: 16px;
    line-height: 1.45;
  }

  .prompt-actions {
    display: flex;
    gap: 12px;
    margin-top: 28px;
    flex-wrap: wrap;
  }

  .listen-button,
  .reveal-button,
  .rating-row button {
    min-height: 48px;
    padding: 0 20px;
    border-radius: 8px;
    font-weight: 840;
  }

  .listen-button {
    min-width: 120px;
    border: 1px solid var(--border-primary);
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
    color: var(--text-primary);
  }

  .listen-button:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .reveal-button {
    min-width: 146px;
    background: var(--mandarin-red);
    color: white;
  }

  .rating-row {
    display: flex;
    gap: 12px;
    margin-top: 30px;
    flex-wrap: wrap;
  }

  .rating-row button {
    min-width: 124px;
  }

  .wrong {
    background: var(--mandarin-red-dark);
    color: white;
  }

  .hard {
    background: var(--mandarin-gold);
    color: var(--bg-primary);
  }

  .correct {
    background: #2f7d52;
    color: white;
  }

  @media (max-width: 560px) {
    .card-meta,
    .answer-topline,
    .rating-row,
    .prompt-actions {
      align-items: stretch;
    }

    .card-meta {
      flex-direction: column;
      gap: 5px;
    }

    .answer-topline {
      flex-direction: column;
    }

    .prompt {
      font-size: 32px;
    }

    .answer p {
      font-size: 58px;
      overflow-wrap: anywhere;
    }

    .speak-button {
      width: 100%;
    }

    .rating-row button,
    .prompt-actions button {
      flex: 1 1 100px;
    }
  }
</style>
