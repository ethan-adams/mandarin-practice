<script lang="ts">
  import { lessonLabel } from '../logic/lessons';
  import { pinyinParts, pinyinText } from '../logic/pinyin';
  import { deriveAutoRating } from '../logic/autoRating';
  import { splitAroundWord } from '../logic/mandarinExamples';
  import { exampleStore } from '../logic/mandarinExamples.svelte';
  import type { Rating } from '../logic/srs';
  import type { PracticeSession } from '../state/session.svelte';
  import type { PracticeSettings } from '../state/settings.svelte';
  import type { SpeechController } from '../state/speech.svelte';
  import type { ToneCoachController } from '../state/toneCoach.svelte';
  import ToneCoachPanel from './ToneCoachPanel.svelte';
  import WritingPractice from './WritingPractice.svelte';

  let {
    session,
    settings,
    speech,
    toneCoach,
    onRate,
    onReveal,
    onOpenStory,
  }: {
    session: PracticeSession;
    settings: PracticeSettings;
    speech: SpeechController;
    toneCoach: ToneCoachController;
    onRate: (rating: Rating) => void;
    onReveal: () => void;
    onOpenStory: (char: string) => void;
  } = $props();

  let currentCard = $derived(session.currentCard);
  let currentPinyin = $derived(currentCard ? pinyinText(currentCard.pinyin) : '');
  let currentParts = $derived(currentCard ? pinyinParts(currentCard.pinyin) : []);
  // Each Han character in the answer opens its Character Story; punctuation and
  // spaces stay inert text.
  const isHan = (ch: string) => /\p{Script=Han}/u.test(ch);
  let answerChars = $derived([...(currentCard?.answerZh ?? '')]);

  // The app judges you: derive the schedule from how you actually did (tone
  // contour + word recognition). Null when you didn't speak — then we fall back
  // to a quiet "knew it / show me again".
  let auto = $derived(deriveAutoRating(toneCoach.schedulingTone, toneCoach.recognitionResult));

  // Real native example sentences for the card's word (Tatoeba, CC BY 2.0).
  exampleStore.load();
  let examples = $derived(exampleStore.for(currentCard?.answerZh ?? ''));

  // The writing panel is opt-in per card; collapse it whenever the card changes.
  let showWriting = $state(false);
  $effect(() => {
    currentCard?.id;
    showWriting = false;
  });
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

  <ToneCoachPanel {toneCoach} answerRevealed={session.showAnswer} />

  {#if session.showAnswer}
    <div class="answer">
      <div class="answer-topline">
        <div>
          <span class="prompt-label">Answer</span>
          <p class="answer-zh" lang="zh-CN">
            {#each answerChars as ch, i (i)}
              {#if isHan(ch)}
                <button class="hanzi" onclick={() => onOpenStory(ch)} aria-label={`See the story of ${ch}`}>{ch}</button>
              {:else}<span>{ch}</span>{/if}
            {/each}
          </p>
        </div>
        <button
          class="speak-button"
          onclick={() => void speech.speakAnswer()}
          aria-label="Replay answer"
          disabled={speech.status === 'playing'}
        >
          {speech.status === 'playing' ? '…' : '▶'}
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

      {#if examples.length}
        <div class="examples">
          <span class="examples-label">In context</span>
          {#each examples as ex}
            <div class="example">
              <p class="example-zh" lang="zh-Hans">
                {#each splitAroundWord(ex.zh, currentCard.answerZh) as part}<span class:hit={part.hit}>{part.text}</span>{/each}
              </p>
              <p class="example-en">{ex.en}</p>
            </div>
          {/each}
          <small class="examples-credit">Sentences from Tatoeba (CC BY 2.0)</small>
        </div>
      {/if}

      <div class="writing-toggle">
        <button type="button" class="trace-step" onclick={() => (showWriting = !showWriting)} aria-expanded={showWriting}>
          <span class="trace-icon" aria-hidden="true">✍</span>
          <span class="trace-copy">
            <strong>{showWriting ? 'Hide tracing' : 'Trace it'}</strong>
            <small>Write the strokes with your finger or mouse</small>
          </span>
        </button>
      </div>
      {#if showWriting}
        {#key currentCard.id}
          <WritingPractice word={currentCard.answerZh} />
        {/key}
      {/if}
    </div>

    {#if auto}
      {@const v = auto}
      <div class="verdict" data-rating={v.rating} role="status">
        <strong>{v.headline}</strong>
        <span>{v.detail}</span>
      </div>
      <div class="rating-row single">
        <button class="next" onclick={() => onRate(v.rating)}>Next</button>
      </div>
    {:else}
      <div class="rating-row fallback">
        <button class="wrong" onclick={() => onRate('wrong')}>Show me again</button>
        <button class="correct" onclick={() => onRate('correct')}>I knew it</button>
      </div>
    {/if}
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

  .answer-zh {
    font-family: var(--font-han, inherit);
  }

  /* Each character is a quiet doorway into its story; the affordance shows on
     hover/focus so the answer still reads as one word at rest. */
  .hanzi {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    line-height: inherit;
    cursor: pointer;
    border-radius: 6px;
    transition: color 120ms ease, background-color 120ms ease;
  }
  .hanzi:hover,
  .hanzi:focus-visible {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    outline: none;
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

  .examples {
    max-width: 720px;
    margin-top: 20px;
    padding: 14px 16px;
    border: 1px solid var(--border-primary);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
  }

  .examples-label {
    display: block;
    margin-bottom: 8px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .example + .example {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-primary);
  }

  .example-zh {
    margin: 0;
    color: var(--text-primary);
    font-size: 20px;
    line-height: 1.5;
  }

  .example-zh .hit {
    color: var(--accent-primary);
    font-weight: 700;
  }

  .example-en {
    margin: 2px 0 0;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.4;
  }

  .examples-credit {
    display: block;
    margin-top: 10px;
    color: var(--text-tertiary);
    font-size: 11px;
  }

  .writing-toggle {
    margin-top: 20px;
  }

  .trace-step {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    min-height: 60px;
    padding: 12px 18px;
    border: 1px solid color-mix(in srgb, var(--accent-primary) 38%, var(--border-primary));
    border-radius: var(--radius, 12px);
    background: color-mix(in srgb, var(--accent-primary) 7%, var(--mandarin-raised));
    color: var(--text-primary);
    text-align: left;
    transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
  }
  .trace-step:hover {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 13%, var(--mandarin-raised));
    transform: translateY(-1px);
  }
  .trace-icon {
    font-size: 22px;
    color: var(--accent-primary);
  }
  .trace-copy {
    display: grid;
    gap: 1px;
  }
  .trace-copy strong {
    font-family: var(--font-display, inherit);
    font-size: 15px;
    font-weight: 800;
  }
  .trace-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
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

  .correct {
    background: var(--accent-primary);
    color: white;
  }

  .verdict {
    display: grid;
    gap: 3px;
    margin-top: 24px;
    padding: 13px 15px;
    border: 1px solid var(--border-primary);
    border-left: 3px solid var(--accent-primary);
    border-radius: 10px;
    background: var(--mandarin-raised);
  }
  .verdict[data-rating='wrong'] { border-left-color: var(--mandarin-red); }
  .verdict[data-rating='hard'] { border-left-color: var(--accent-gold); }
  .verdict strong {
    font-family: var(--font-display, inherit);
    font-size: 15px;
    color: var(--text-primary);
  }
  .verdict span { color: var(--text-secondary); font-size: 13px; }

  .rating-row.single { margin-top: 12px; }
  .rating-row.single .next { flex: 1; background: var(--accent-primary); color: #fff; }
  .rating-row.single .next:hover { background: var(--accent-hover); }
  .rating-row.fallback button { flex: 1; }

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
