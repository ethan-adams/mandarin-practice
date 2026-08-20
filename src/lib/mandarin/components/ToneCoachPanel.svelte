<script lang="ts">
  import {
    TONE_FEEDBACK_EXPERIMENTAL,
    TONE_FEEDBACK_EXPERIMENTAL_HINT,
    TONE_FEEDBACK_EXPERIMENTAL_LABEL,
    toneAssessmentHasVerdict,
  } from '../../utils/mandarinToneAssessment';
  import { displayPinyinSyllable } from '../logic/pinyin';
  import type { ToneCoachController } from '../state/toneCoach.svelte';
  import type { PracticeSettings } from '../state/settings.svelte';

  let {
    toneCoach,
    settings,
    answerRevealed,
  }: {
    toneCoach: ToneCoachController;
    settings: PracticeSettings;
    answerRevealed: boolean;
  } = $props();

  // Recall integrity: the tiles spell out the expected answer (hanzi +
  // pinyin), so they stay hidden until the learner reveals or has finished a
  // spoken attempt. During live capture, blank tiles still track the active
  // syllable.
  let tilesRevealed = $derived(
    answerRevealed || (!toneCoach.toneAssessmentActive && (toneCoach.recognitionResult !== null || toneCoach.toneAssessment !== null)),
  );
</script>

<div class="pronunciation-panel" data-status={toneCoach.recognitionState} aria-live="polite">
  <div class="feedback-heading">
    <span>Tone coach</span>
    <strong>{toneCoach.recognitionLabel}</strong>
  </div>
  <small class:tone-experimental-detail={toneCoach.detailExperimental}>{toneCoach.recognitionDetail}</small>
  {#if toneCoach.nativeMatch && !toneCoach.toneAssessmentActive}
    <div class="native-compare" data-status={toneCoach.nativeMatch.status}>
      <span class="native-dot" aria-hidden="true"></span>
      <small>{toneCoach.nativeSummary}</small>
    </div>
    {#if toneCoach.nativeSyllables.length > 1}
      <div class="native-syllables" aria-label="Per-syllable pitch match against the native audio">
        {#each toneCoach.nativeSyllables as segment}
          <span data-status={segment.status}></span>
        {/each}
      </div>
    {/if}
  {/if}
  {#if !toneCoach.textRecognitionAvailable && !toneCoach.toneAssessmentActive && toneCoach.toneAssessment}
    <small class="native-note">Word recognition isn't available in this browser; tone feedback still works by comparing your pitch to the native audio.</small>
  {/if}
  {#if tilesRevealed}
    <div class="character-feedback" aria-label="Per-character pronunciation feedback">
      {#each toneCoach.characterFeedback as unit}
        <span data-status={unit.status} class:has-feedback={unit.status !== 'pending'}>
          <strong lang="zh-CN">{unit.text}</strong>
          {#if settings.showPinyin && unit.pinyin}
            <em>{displayPinyinSyllable(unit.pinyin)}</em>
          {/if}
          <small>
            <b>{unit.marker}</b>
            {unit.detail}
          </small>
        </span>
      {/each}
    </div>
  {:else if toneCoach.toneAssessmentActive}
    <div class="character-feedback" aria-label="Per-syllable listening progress">
      {#each toneCoach.characterFeedback as unit, index}
        <span data-status={unit.status} class="tile-blank">
          <strong aria-hidden="true">·</strong>
          <small>{unit.status === 'active' ? 'listening' : `syllable ${index + 1}`}</small>
        </span>
      {/each}
    </div>
  {:else}
    <small class="tiles-hint">Per-character feedback appears here after you speak or reveal.</small>
  {/if}
  {#if toneCoach.toneAssessment && (toneCoach.toneAssessmentActive || toneAssessmentHasVerdict(toneCoach.toneAssessment))}
    <div class="tone-summary-row">
      <div class="tone-summary" aria-label="Tone summary">
        {#each toneCoach.toneAssessment.syllables as syllable}
          <span data-status={syllable.status}></span>
        {/each}
      </div>
      {#if TONE_FEEDBACK_EXPERIMENTAL}
        <button
          type="button"
          class="tone-experimental-badge"
          aria-expanded={toneCoach.toneHintVisible}
          aria-label={`Tone feedback is experimental. ${TONE_FEEDBACK_EXPERIMENTAL_HINT}`}
          title={TONE_FEEDBACK_EXPERIMENTAL_HINT}
          onclick={() => (toneCoach.toneHintVisible = !toneCoach.toneHintVisible)}
        >{TONE_FEEDBACK_EXPERIMENTAL_LABEL}</button>
      {/if}
    </div>
    {#if TONE_FEEDBACK_EXPERIMENTAL && toneCoach.toneHintVisible}
      <small class="tone-experimental-hint">{TONE_FEEDBACK_EXPERIMENTAL_HINT}</small>
    {/if}
  {/if}
</div>

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .pronunciation-panel {
    display: grid;
    gap: 8px;
    max-width: 860px;
    margin-top: 26px;
    padding: 14px;
    border: 1px solid var(--border-primary);
    border-left: 4px solid var(--border-primary);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-primary) 64%, var(--bg-secondary));
  }

  .feedback-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .feedback-heading span {
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .feedback-heading strong {
    color: var(--text-primary);
    font-size: 17px;
    line-height: 1.2;
  }

  .pronunciation-panel small {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.35;
  }

  .pronunciation-panel[data-status='listening'] {
    border-left-color: var(--mandarin-blue);
  }

  .pronunciation-panel[data-status='matched'],
  .pronunciation-panel[data-status='close'] {
    border-left-color: #2f7d52;
  }

  .pronunciation-panel[data-status='missed'],
  .pronunciation-panel[data-status='no_speech'],
  .pronunciation-panel[data-status='unscored'],
  .pronunciation-panel[data-status='error'] {
    border-left-color: var(--mandarin-red-dark);
  }

  .character-feedback {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px;
    margin-top: 10px;
  }

  .character-feedback span {
    position: relative;
    display: grid;
    grid-template-rows: minmax(48px, auto) 18px 17px;
    align-items: center;
    min-height: 96px;
    padding: 10px 9px 8px;
    border: 2px solid var(--border-primary);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-primary) 76%, var(--bg-secondary));
    box-shadow: inset 0 -2px 0 color-mix(in srgb, var(--text-primary) 8%, transparent);
    text-transform: none;
    transition:
      border-color 120ms ease,
      background-color 120ms ease,
      transform 120ms ease;
  }

  .character-feedback span[data-status='active'] {
    border-color: var(--mandarin-blue);
    background: color-mix(in srgb, var(--mandarin-blue) 12%, var(--bg-primary));
    transform: translateY(-2px);
  }

  .character-feedback span[data-status='matched'] {
    border-color: #2f7d52;
    background: color-mix(in srgb, #2f7d52 13%, var(--bg-primary));
  }

  .character-feedback span[data-status='close'] {
    border-color: var(--mandarin-gold);
    background: color-mix(in srgb, var(--mandarin-gold) 14%, var(--bg-primary));
  }

  .character-feedback span[data-status='missed'] {
    border-color: var(--mandarin-red-dark);
    background: color-mix(in srgb, var(--mandarin-red) 11%, var(--bg-primary));
  }

  .character-feedback span[data-status='unverified'] {
    border-color: color-mix(in srgb, var(--ink) 18%, transparent);
    background: color-mix(in srgb, var(--paper) 88%, var(--ink));
  }

  .character-feedback strong {
    color: var(--text-primary);
    font-size: clamp(34px, 5vw, 58px);
    line-height: 0.96;
    font-weight: 900;
    text-align: center;
  }

  .character-feedback em,
  .character-feedback small {
    color: var(--text-secondary);
    font-style: normal;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .character-feedback em {
    opacity: 0.72;
    font-size: 12px;
    font-weight: 760;
    line-height: 1.1;
  }

  .character-feedback small {
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 740;
    line-height: 1.1;
  }

  .character-feedback b {
    display: inline-block;
    min-width: 12px;
    color: var(--text-primary);
    font-weight: 900;
  }

  .tile-blank strong {
    color: var(--text-tertiary);
  }

  .tiles-hint {
    color: var(--text-tertiary);
  }

  .tone-summary-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }

  .tone-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18px, 1fr));
    gap: 4px;
    max-width: 340px;
    flex: 1 1 auto;
  }

  .tone-experimental-badge {
    flex: 0 0 auto;
    padding: 1px 7px;
    border: 1px solid var(--border-primary);
    border-radius: 999px;
    background: var(--bg-tertiary);
    color: var(--text-tertiary);
    font-size: 0.62rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    cursor: help;
    line-height: 1.4;
  }

  .tone-experimental-badge:hover,
  .tone-experimental-badge:focus-visible {
    color: var(--text-secondary);
    border-color: var(--text-tertiary);
  }

  .tone-experimental-hint {
    display: block;
    margin-top: 4px;
    color: var(--text-tertiary);
    font-size: 0.72rem;
    line-height: 1.35;
  }

  /* Subtle cue that a tone verdict is an experimental estimate, not a fact. */
  .tone-experimental-detail {
    font-style: italic;
    color: var(--text-tertiary);
  }

  .tone-summary span {
    height: 5px;
    border-radius: 5px;
    background: var(--border-primary);
  }

  .tone-summary span[data-status='matched'] {
    background: #2f7d52;
  }

  .tone-summary span[data-status='close'] {
    background: var(--mandarin-gold);
  }

  .tone-summary span[data-status='missed'] {
    background: var(--mandarin-red-dark);
  }

  .tone-summary span[data-status='pending'] {
    background: color-mix(in srgb, var(--text-tertiary) 30%, transparent);
  }

  .native-compare {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 2px;
  }

  .native-dot {
    flex: 0 0 auto;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--border-primary);
  }

  .native-compare[data-status='matched'] .native-dot {
    background: #2f7d52;
  }

  .native-compare[data-status='close'] .native-dot {
    background: var(--mandarin-gold);
  }

  .native-compare[data-status='missed'] .native-dot {
    background: var(--mandarin-red-dark);
  }

  .native-compare small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 720;
  }

  .native-syllables {
    display: grid;
    grid-auto-flow: column;
    gap: 4px;
    margin-top: 2px;
  }

  .native-syllables span {
    height: 5px;
    border-radius: 5px;
    background: var(--border-primary);
  }

  .native-syllables span[data-status='matched'] {
    background: #2f7d52;
  }

  .native-syllables span[data-status='close'] {
    background: var(--mandarin-gold);
  }

  .native-syllables span[data-status='missed'] {
    background: var(--mandarin-red-dark);
  }

  .native-note {
    color: var(--text-tertiary);
    font-size: 11px;
    line-height: 1.35;
  }

  @media (max-width: 560px) {
    .feedback-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 3px;
    }
  }
</style>
