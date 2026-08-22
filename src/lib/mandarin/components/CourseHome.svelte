<script lang="ts">
  import { courseSections, unitProgress, type CourseUnit } from '../logic/course';
  import { upcomingFestival } from '../logic/festivals';
  import FestivalCard from './FestivalCard.svelte';
  import type { Mode, PracticeSession } from '../state/session.svelte';

  let {
    session,
    onContinue,
    onStartUnit,
    onStartSection,
    onQuickMode,
    onShowListening,
  }: {
    session: PracticeSession;
    onContinue: () => void;
    onStartUnit: (lessonId: string) => void;
    onStartSection: (lessonIds: string[], label: string) => void;
    onQuickMode: (mode: Mode) => void;
    onShowListening: () => void;
  } = $props();

  let overall = $derived(unitProgress(session.cards, session.reviewState));
  let sections = $derived(courseSections(session.cards, session.deckUnits));
  // Culture over gamification: when a festival is near, greet it — otherwise
  // nothing shows (no year-round banner).
  let festival = $derived(upcomingFestival());

  // Explore, not a review queue: no "due" counts, no guilt. We frame progress as
  // ground covered; the adaptive engine quietly resurfaces weak items behind the
  // "Strengthen" entry rather than nagging with due dates.
  let continueDetail = $derived.by(() => {
    if (overall.seen === 0) return 'Start anywhere — pick a track below and go.';
    return `You've met ${overall.seen} of ${overall.total} words. Keep the thread going.`;
  });

  function progressOf(unit: CourseUnit) {
    return unitProgress(unit.cards, session.reviewState);
  }

  function unitDetail(unit: CourseUnit) {
    const p = progressOf(unit);
    if (p.seen === 0) return `${p.total} words · not started`;
    return `${p.mastered} of ${p.total} sticking well`;
  }
</script>

<div class="course-home">
  {#if festival}
    <FestivalCard upcoming={festival} />
  {/if}

  <section class="hero" aria-label="Continue learning">
    <div class="hero-copy">
      <span class="hero-kicker">{overall.seen ? 'Pick up where you left off' : 'Start exploring'}</span>
      <strong>{continueDetail}</strong>
      <div class="hero-bar" role="img" aria-label={`${overall.mastered} of ${overall.total} words sticking well`}>
        <span class="bar-seen" style={`width: ${overall.total ? (overall.seen / overall.total) * 100 : 0}%`}></span>
        <span class="bar-mastered" style={`width: ${overall.total ? (overall.mastered / overall.total) * 100 : 0}%`}></span>
      </div>
      <small>{overall.mastered} sticking well · {overall.seen} met</small>
    </div>
    <button class="continue-button" onclick={onContinue}>Continue</button>
  </section>

  <nav class="quick-modes" aria-label="Ways to practice">
    <button class="strengthen" onclick={() => onQuickMode('due')}>
      <strong>✦</strong>
      <span>Strengthen<small>weak spots resurface</small></span>
    </button>
    <button onclick={() => onQuickMode('all')}>
      <strong>{session.cards.length}</strong>
      <span>Browse all</span>
    </button>
    <button onclick={onShowListening}>
      <strong>♪</strong>
      <span>Listening</span>
    </button>
  </nav>

  {#each sections as section (section.id)}
    {@const sectionCards = section.units.flatMap((u) => u.cards)}
    {@const lessonIds = section.units.map((u) => u.meta.id)}
    <section class="unit-section" aria-label={section.title}>
      <div class="section-head">
        <h2>{section.title}</h2>
        <button
          class="section-start"
          onclick={() => onStartSection(lessonIds, section.title)}
          aria-label={`Practice all of ${section.title}`}
        >
          Practice all
          <span>{sectionCards.length} cards</span>
        </button>
      </div>
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
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-lg, 18px);
    background:
      linear-gradient(120deg, color-mix(in srgb, var(--accent-primary) 8%, transparent), transparent 60%),
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
    color: var(--accent-primary);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .hero-copy > strong {
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: clamp(20px, 2.6vw, 28px);
    line-height: 1.15;
    font-weight: 800;
  }

  .hero-copy small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
  }

  .hero-bar,
  .unit-bar {
    position: relative;
    display: block;
    height: 8px;
    max-width: 420px;
    overflow: hidden;
    border-radius: 999px;
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
    background: color-mix(in srgb, var(--accent-gold) 50%, var(--bg-tertiary));
  }

  .bar-mastered {
    background: var(--accent-primary);
  }

  .continue-button {
    flex: 0 0 auto;
    min-height: 58px;
    padding: 0 clamp(24px, 4vw, 44px);
    border-radius: var(--radius, 12px);
    background: var(--accent-primary);
    color: #fff;
    font-family: var(--font-display, inherit);
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.01em;
    transition: background-color 120ms ease, transform 120ms ease;
  }

  .continue-button:hover {
    background: var(--accent-hover);
    transform: translateY(-1px);
  }

  .quick-modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .quick-modes button {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 60px;
    padding: 10px 14px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius, 12px);
    background: var(--mandarin-raised);
    color: var(--text-secondary);
    text-align: left;
    transition: border-color 120ms ease, background-color 120ms ease;
  }

  .quick-modes button:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border-primary));
    background: color-mix(in srgb, var(--accent-primary) 5%, var(--mandarin-raised));
  }

  .quick-modes strong {
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: 18px;
    line-height: 1;
    flex: none;
    width: 26px;
    text-align: center;
  }

  .quick-modes span {
    display: grid;
    font-size: 13px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .quick-modes span small {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-tertiary);
  }

  /* the one rationed cinnabar accent on this screen */
  .quick-modes .strengthen strong {
    color: var(--mandarin-red);
  }
  .quick-modes .strengthen:hover {
    border-color: color-mix(in srgb, var(--mandarin-red) 40%, var(--border-primary));
    background: color-mix(in srgb, var(--mandarin-red) 5%, var(--mandarin-raised));
  }

  .unit-section {
    display: grid;
    gap: 10px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 4px 0 0;
  }

  .unit-section h2 {
    margin: 0;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 0.01em;
  }

  .section-start {
    display: grid;
    justify-items: end;
    gap: 1px;
    flex: 0 0 auto;
    padding: 7px 14px;
    border: 1px solid color-mix(in srgb, var(--accent-primary) 36%, var(--border-primary));
    border-radius: var(--radius-sm, 8px);
    background: color-mix(in srgb, var(--accent-primary) 7%, var(--mandarin-raised));
    color: var(--accent-primary);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.02em;
    transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
  }

  .section-start span {
    color: var(--text-secondary);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .section-start:hover {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 13%, var(--mandarin-raised));
    transform: translateY(-1px);
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
    border-left: 3px solid color-mix(in srgb, var(--accent-primary) 45%, var(--border-primary));
    border-radius: var(--radius, 12px);
    background: var(--mandarin-raised);
    color: var(--text-primary);
    text-align: left;
    transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
  }

  .unit-card:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 42%, var(--border-primary));
    background: color-mix(in srgb, var(--accent-primary) 6%, var(--mandarin-raised));
    transform: translateY(-1px);
  }

  .unit-kicker {
    color: var(--accent-primary);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .unit-card > strong {
    font-family: var(--font-display, inherit);
    font-size: 16px;
    line-height: 1.25;
    font-weight: 800;
  }

  .unit-card small {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 600;
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
  }
</style>
