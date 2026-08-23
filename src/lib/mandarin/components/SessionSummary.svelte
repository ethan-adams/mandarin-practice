<script lang="ts">
  import { dayStreak, dueOutlook, sessionTally } from '../logic/sessionStats';
  import type { PracticeSession } from '../state/session.svelte';

  let {
    session,
    onKeepGoing,
    onGoHome,
  }: {
    session: PracticeSession;
    onKeepGoing: () => void;
    onGoHome: () => void;
  } = $props();

  let tally = $derived(sessionTally(session.sessionRatings));
  let streak = $derived(dayStreak(session.practiceDays));
  let outlook = $derived(dueOutlook(session.cards, session.reviewState));
  let moreAvailable = $derived(session.selectedCards.length > 0);

  // Explore, not a review queue: no "due today" counts, no scheduled dates
  // (that guilt is exactly what the redesign removed). Just an honest, gentle
  // note on what's ahead — weak items resurface quietly under the hood.
  let outlookLine = $derived.by(() => {
    if (outlook.fresh > 0) {
      return `${outlook.fresh} new ${outlook.fresh === 1 ? 'word' : 'words'} still ahead — no rush.`;
    }
    return "You've met every word here. The tricky ones will resurface on their own.";
  });
</script>

<section class="session-summary" aria-label="Session summary">
  <span class="summary-kicker">Session complete</span>
  <h2>{tally.correct === tally.done && tally.done > 0 ? 'Perfect run!' : 'Nice work.'}</h2>

  <div class="stat-row">
    <div class="stat">
      <strong>{tally.done}</strong>
      <span>cards done</span>
    </div>
    <div class="stat">
      <strong>{tally.accuracyPct === null ? ' - ' : `${tally.accuracyPct}%`}</strong>
      <span>correct{tally.hard ? ` · ${tally.hard} hard` : ''}</span>
    </div>
    <div class="stat">
      <strong>{streak}</strong>
      <span>day streak</span>
    </div>
  </div>

  <p class="outlook">{outlookLine}</p>

  <div class="summary-actions">
    {#if moreAvailable}
      <button class="keep-going" onclick={onKeepGoing}>Keep going</button>
    {/if}
    <button class="back-home" onclick={onGoHome}>Back to course</button>
  </div>
  {#if moreAvailable}
    <small class="keyboard-hint">Enter to keep going</small>
  {/if}
</section>

<style>
  button {
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
  }

  .session-summary {
    display: grid;
    gap: 16px;
    justify-items: start;
    max-width: 620px;
  }

  .summary-kicker {
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 860;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(32px, 4.5vw, 54px);
    line-height: 1.02;
    font-weight: 880;
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    width: 100%;
    margin-top: 6px;
  }

  .stat {
    display: grid;
    gap: 3px;
    padding: 14px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
  }

  .stat strong {
    color: var(--text-primary);
    font-size: clamp(24px, 3vw, 34px);
    line-height: 1.05;
    font-weight: 880;
  }

  .stat span {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 760;
  }

  .outlook {
    margin: 0;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.45;
  }

  .summary-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 4px;
  }

  .keep-going {
    min-height: 52px;
    padding: 0 26px;
    background: var(--accent-primary);
    color: white;
    font-size: 16px;
    font-weight: 860;
  }

  .keep-going:hover {
    background: var(--accent-hover);
  }

  .back-home {
    min-height: 52px;
    padding: 0 20px;
    border: 1px solid var(--border-primary);
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
    color: var(--text-primary);
    font-weight: 800;
  }

  .keyboard-hint {
    color: var(--text-tertiary);
    font-size: 12px;
  }

  @media (hover: none) and (pointer: coarse) {
    .keyboard-hint {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .stat-row {
      grid-template-columns: 1fr;
    }

    .summary-actions {
      width: 100%;
    }

    .keep-going,
    .back-home {
      flex: 1 1 140px;
    }
  }
</style>
