<script lang="ts">
  import { characterProgress, journeyStats } from '../logic/journey';
  import { dayStreak } from '../logic/sessionStats';
  import type { PracticeSession } from '../state/session.svelte';

  let {
    session,
    onOpenStory,
    onExplore,
  }: {
    session: PracticeSession;
    onOpenStory: (char: string) => void;
    onExplore: () => void;
  } = $props();

  let stats = $derived(journeyStats(session.cards, session.reviewState));
  let chars = $derived(characterProgress(session.cards, session.reviewState));

  // Journey is a map of ground covered, not a queue. Show the characters you've
  // actually met (sticking first, then the rest of the met set); fresh ones are
  // summarised as "still ahead", never itemised as a chore.
  let met = $derived(
    chars
      .filter((c) => c.status !== 'fresh')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'sticking' ? -1 : 1;
        return b.seenIn - a.seenIn;
      }),
  );
  let ahead = $derived(stats.charsTotal - stats.charsMet);

  let streak = $derived(dayStreak(session.practiceDays));

  let intro = $derived.by(() => {
    if (stats.charsMet === 0) return 'Your journey starts the moment you speak your first card.';
    if (stats.charsSticking === 0) return `You've met ${stats.charsMet} characters. Keep meeting them and they'll start to stick.`;
    return `${stats.charsSticking} characters are sticking well — the writing is becoming yours.`;
  });
</script>

<div class="journey">
  <header class="journey-head">
    <span class="kicker">Journey</span>
    <h2>{intro}</h2>
    {#if streak > 1}
      <p class="streak">{streak} days exploring in a row · nice and steady.</p>
    {/if}
  </header>

  <div class="stat-row">
    <div class="stat">
      <strong>{stats.charsMet}</strong>
      <span>characters met</span>
      <small>of {stats.charsTotal} in the deck</small>
    </div>
    <div class="stat accent">
      <strong>{stats.charsSticking}</strong>
      <span>sticking well</span>
      <small>learned a week or more</small>
    </div>
    <div class="stat">
      <strong>{stats.wordsMet}</strong>
      <span>phrases met</span>
      <small>{stats.wordsSticking} sticking well</small>
    </div>
  </div>

  {#if met.length}
    <section class="chars" aria-label="Characters you've met">
      <div class="chars-head">
        <h3>Characters you've met</h3>
        <p class="legend"><span class="dot sticking"></span> sticking well <span class="dot met"></span> still settling</p>
      </div>
      <div class="char-grid">
        {#each met as entry (entry.char)}
          <button
            class="char-tile"
            data-status={entry.status}
            lang="zh-CN"
            onclick={() => onOpenStory(entry.char)}
            aria-label={`${entry.char} — ${entry.status === 'sticking' ? 'sticking well' : 'still settling'}. Open its story.`}
          >
            {entry.char}
          </button>
        {/each}
      </div>
      {#if ahead > 0}
        <p class="ahead">{ahead} more characters still ahead — meet them whenever you like.</p>
      {/if}
    </section>
  {:else}
    <section class="empty">
      <p>No characters met yet. Head into Explore, speak a card, and this map fills in as you go.</p>
      <button class="explore" onclick={onExplore}>Start exploring</button>
    </section>
  {/if}
</div>

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .journey {
    display: grid;
    gap: 22px;
    max-width: 1280px;
    margin: 0 auto;
  }

  .journey-head {
    display: grid;
    gap: 6px;
  }

  .kicker {
    color: var(--accent-primary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .journey-head h2 {
    margin: 0;
    max-width: 760px;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: clamp(20px, 2.6vw, 30px);
    line-height: 1.18;
    font-weight: 800;
  }

  .streak {
    margin: 2px 0 0;
    color: var(--accent-gold);
    font-size: 13px;
    font-weight: 700;
  }

  .stat-row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .stat {
    display: grid;
    gap: 2px;
    padding: 16px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius, 12px);
    background: var(--mandarin-raised);
  }

  .stat.accent {
    border-left: 3px solid var(--accent-primary);
  }

  .stat strong {
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: clamp(26px, 4vw, 34px);
    line-height: 1;
    font-weight: 820;
  }

  .stat.accent strong {
    color: var(--accent-primary);
  }

  .stat span {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 700;
  }

  .stat small {
    color: var(--text-tertiary);
    font-size: 11.5px;
    font-weight: 600;
  }

  .chars {
    display: grid;
    gap: 12px;
  }

  .chars-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .chars-head h3 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: 17px;
    font-weight: 800;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--text-tertiary);
    font-size: 11.5px;
    font-weight: 600;
  }

  .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 999px;
  }
  .dot.sticking { background: var(--accent-primary); }
  .dot.met { background: color-mix(in srgb, var(--accent-gold) 60%, var(--bg-tertiary)); margin-left: 8px; }

  .char-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
    gap: 8px;
  }

  .char-tile {
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm, 8px);
    background: var(--mandarin-raised);
    color: var(--text-primary);
    font-family: var(--font-han, sans-serif);
    font-size: clamp(22px, 4.4vw, 30px);
    line-height: 1;
    transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease;
  }

  .char-tile[data-status='sticking'] {
    border-color: color-mix(in srgb, var(--accent-primary) 55%, var(--border-primary));
    background: color-mix(in srgb, var(--accent-primary) 9%, var(--mandarin-raised));
  }

  .char-tile[data-status='met'] {
    border-bottom: 2px solid color-mix(in srgb, var(--accent-gold) 55%, var(--border-primary));
  }

  .char-tile:hover {
    transform: translateY(-1px);
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 14%, var(--mandarin-raised));
  }

  .ahead {
    margin: 2px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
  }

  .empty {
    display: grid;
    justify-items: start;
    gap: 14px;
    padding: 22px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius, 12px);
    background: var(--mandarin-raised);
    color: var(--text-secondary);
  }

  .empty .explore {
    min-height: 46px;
    padding: 0 22px;
    border-radius: var(--radius, 12px);
    background: var(--accent-primary);
    color: #fff;
    font-family: var(--font-display, inherit);
    font-weight: 800;
  }

  @media (max-width: 560px) {
    .stat-row {
      grid-template-columns: 1fr;
    }
  }
</style>
