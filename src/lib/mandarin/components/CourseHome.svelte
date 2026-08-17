<script lang="ts">
  import { courseSections, unitProgress, type CourseUnit } from '../logic/course';
  import type { Mode, PracticeSession } from '../state/session.svelte';

  let {
    session,
    onContinue,
    onStartUnit,
    onQuickMode,
    onShowListening,
  }: {
    session: PracticeSession;
    onContinue: () => void;
    onStartUnit: (lessonId: string) => void;
    onQuickMode: (mode: Mode) => void;
    onShowListening: () => void;
  } = $props();

  let overall = $derived(unitProgress(session.cards, session.reviewState));
  let sections = $derived(courseSections(session.cards, session.deckUnits));

  let continueDetail = $derived.by(() => {
    if (overall.due) return `${overall.due} to review · ${overall.fresh} new`;
    if (overall.fresh) return `${overall.fresh} new card${overall.fresh === 1 ? '' : 's'} waiting`;
    return 'All caught up - review anything, or train your ear';
  });

  function progressOf(unit: CourseUnit) {
    return unitProgress(unit.cards, session.reviewState);
  }

  function unitDetail(unit: CourseUnit) {
    const p = progressOf(unit);
    if (p.seen === 0) return `Not started · ${p.total} cards`;
    const due = p.due ? ` · ${p.due} due` : '';
    return `${p.mastered}/${p.total} mastered${due}`;
  }
</script>

<div class="course-home">
  <section class="hero" aria-label="Continue practicing">
    <div class="hero-copy">
      <span class="hero-kicker">{overall.due ? 'Reviews are ready' : overall.fresh ? 'Fresh cards ahead' : 'All caught up'}</span>
      <strong>{continueDetail}</strong>
      <div class="hero-bar" role="img" aria-label={`${overall.mastered} of ${overall.total} cards mastered`}>
        <span class="bar-seen" style={`width: ${overall.total ? (overall.seen / overall.total) * 100 : 0}%`}></span>
        <span class="bar-mastered" style={`width: ${overall.total ? (overall.mastered / overall.total) * 100 : 0}%`}></span>
      </div>
      <small>{overall.mastered} of {overall.total} mastered · {overall.seen} seen</small>
    </div>
    <button class="continue-button" onclick={onContinue}>Continue</button>
  </section>

  <!-- Counts match the hero's honest split: Due = seen cards whose review is
       due, New = never-seen. (The practice queue for "Due" also serves new
       cards so a session is never empty.) -->
  <nav class="quick-modes" aria-label="Practice modes">
    <button onclick={() => onQuickMode('due')}><strong>{overall.due}</strong> Due</button>
    <button onclick={() => onQuickMode('new')}><strong>{overall.fresh}</strong> New</button>
    <button onclick={() => onQuickMode('all')}><strong>{session.cards.length}</strong> All cards</button>
    <button onclick={onShowListening}><strong>♪</strong> Listening</button>
  </nav>

  {#each sections as section (section.id)}
    <section class="unit-section" aria-label={section.title}>
      <h2>{section.title}</h2>
      <div class="unit-grid" class:compact={section.compact}>
        {#each section.units as unit (unit.meta.id)}
          {@const p = progressOf(unit)}
          <button class="unit-card" onclick={() => onStartUnit(unit.meta.id)} aria-label={`Practice ${unit.meta.title}`}>
            <span class="unit-kicker">{unit.meta.kicker}</span>
            <strong>{unit.meta.title}</strong>
            <span class="unit-bar">
              <span class="bar-seen" style={`width: ${p.total ? (p.seen / p.total) * 100 : 0}%`}></span>
              <span class="bar-mastered" style={`width: ${p.total ? (p.mastered / p.total) * 100 : 0}%`}></span>
            </span>
            <small>{unitDetail(unit)}</small>
          </button>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .course-home {
    display: grid;
    gap: 22px;
    max-width: 1280px;
    margin: 0 auto;
  }

  .hero {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    padding: clamp(18px, 3vw, 28px);
    border: 1px solid color-mix(in srgb, var(--mandarin-red) 34%, var(--border-primary));
    border-radius: 10px;
    background:
      linear-gradient(120deg, color-mix(in srgb, var(--mandarin-red) 9%, transparent), color-mix(in srgb, var(--mandarin-gold) 7%, transparent)),
      var(--mandarin-raised);
    box-shadow: var(--shadow-sm);
  }

  .hero-copy {
    display: grid;
    gap: 8px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .hero-kicker {
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 840;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-copy > strong {
    color: var(--text-primary);
    font-size: clamp(20px, 2.6vw, 28px);
    line-height: 1.15;
    font-weight: 860;
  }

  .hero-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 740;
  }

  .hero-bar,
  .unit-bar {
    position: relative;
    display: block;
    height: 8px;
    max-width: 420px;
    overflow: hidden;
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-tertiary) 84%, var(--bg-primary));
  }

  .bar-seen,
  .bar-mastered {
    position: absolute;
    inset: 0 auto 0 0;
    display: block;
    border-radius: inherit;
    transition: width 200ms ease;
  }

  .bar-seen {
    background: color-mix(in srgb, var(--mandarin-gold) 55%, var(--bg-tertiary));
  }

  .bar-mastered {
    background: #2f7d52;
  }

  .continue-button {
    flex: 0 0 auto;
    min-height: 58px;
    padding: 0 clamp(24px, 4vw, 44px);
    border-radius: 10px;
    background: var(--mandarin-red);
    color: white;
    font-size: 17px;
    font-weight: 860;
    letter-spacing: 0.01em;
    transition: background-color 120ms ease, transform 120ms ease;
  }

  .continue-button:hover {
    background: var(--mandarin-red-dark);
    transform: translateY(-1px);
  }

  .quick-modes {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .quick-modes button {
    display: grid;
    gap: 2px;
    min-height: 54px;
    padding: 8px 10px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--mandarin-raised);
    color: var(--text-tertiary);
    font-size: 11px;
    font-weight: 780;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    transition: border-color 120ms ease, background-color 120ms ease;
  }

  .quick-modes button:hover {
    border-color: color-mix(in srgb, var(--mandarin-red) 42%, var(--border-primary));
    background: color-mix(in srgb, var(--mandarin-red) 6%, var(--mandarin-raised));
  }

  .quick-modes strong {
    color: var(--text-primary);
    font-size: 18px;
    line-height: 1.1;
  }

  .unit-section {
    display: grid;
    gap: 10px;
  }

  .unit-section h2 {
    margin: 4px 0 0;
    color: var(--text-primary);
    font-size: 17px;
    font-weight: 840;
    letter-spacing: 0.01em;
  }

  .unit-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .unit-card {
    display: grid;
    gap: 7px;
    padding: 14px;
    border: 1px solid var(--border-primary);
    border-left: 4px solid color-mix(in srgb, var(--mandarin-red) 40%, var(--border-primary));
    border-radius: 8px;
    background: var(--mandarin-raised);
    color: var(--text-primary);
    text-align: left;
    transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
  }

  .unit-card:hover {
    border-color: color-mix(in srgb, var(--mandarin-red) 42%, var(--border-primary));
    background: color-mix(in srgb, var(--mandarin-red) 7%, var(--mandarin-raised));
    transform: translateY(-1px);
  }

  .unit-kicker {
    color: var(--mandarin-red);
    font-size: 10px;
    font-weight: 820;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .unit-card > strong {
    font-size: 16px;
    line-height: 1.25;
    font-weight: 840;
  }

  .unit-card small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 720;
  }

  @media (min-width: 700px) {
    .unit-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .unit-grid.compact {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (min-width: 1040px) {
    .unit-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .unit-grid.compact {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .hero {
      flex-direction: column;
      align-items: stretch;
    }

    .continue-button {
      width: 100%;
    }

    .quick-modes {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
