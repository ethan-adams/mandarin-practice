<script lang="ts">
  import HanziWriter from 'hanzi-writer';
  import { hanziDataPath } from '../../utils/hanziChars';
  import {
    ancientForms,
    buildStory,
    loadAncientManifest,
    loadHanziDict,
    type AncientEra,
    type CharStory,
    type HanziDict,
  } from '../logic/characterStory';
  import WritingPractice from './WritingPractice.svelte';

  let {
    char,
    onClose,
    onOpenStory,
    backLabel = 'Back',
  }: {
    char: string;
    onClose: () => void;
    onOpenStory: (char: string) => void;
    backLabel?: string;
  } = $props();

  let dict = $state<HanziDict | null>(null);
  let manifest = $state<Record<string, AncientEra[]>>({});
  let loadError = $state(false);
  let showTrace = $state(false);
  let hero = $state<HTMLDivElement | null>(null);
  let strokeError = $state(false);
  let writer: HanziWriter | null = null;

  let story = $derived<CharStory | null>(dict ? buildStory(char, dict) : null);
  let forms = $derived(ancientForms(char, manifest));

  const roleLabel = { semantic: 'meaning', phonetic: 'sound', part: 'part' } as const;

  $effect(() => {
    let alive = true;
    loadHanziDict()
      .then((d) => alive && (dict = d))
      .catch(() => alive && (loadError = true));
    void loadAncientManifest().then((m) => alive && (manifest = m));
    return () => {
      alive = false;
    };
  });

  // Collapse the trace panel whenever the character changes (drilling into a part).
  $effect(() => {
    char;
    showTrace = false;
  });

  // Animate the strokes on the hero as the character (or view) mounts.
  $effect(() => {
    const el = hero;
    const c = char;
    if (!el || !c) return;
    el.innerHTML = '';
    strokeError = false;
    const created = HanziWriter.create(el, c, {
      width: 200,
      height: 200,
      padding: 6,
      showCharacter: true,
      showOutline: true,
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 120,
      strokeColor: '#2E7D5B',
      outlineColor: '#c9ccd1',
      charDataLoader: (ch: string) =>
        fetch(hanziDataPath(ch)).then((r) => {
          if (!r.ok) throw new Error(`stroke data ${r.status}`);
          return r.json();
        }),
      onLoadCharDataError: () => {
        strokeError = true;
      },
    });
    writer = created;
    void created.animateCharacter();
    return () => {
      el.innerHTML = '';
      writer = null;
    };
  });

  function replay() {
    void writer?.animateCharacter();
  }
</script>

<div class="story">
  <button class="back" onclick={onClose}>← {backLabel}</button>

  {#if loadError}
    <p class="muted">Couldn’t load the character dictionary. <button class="link" onclick={() => (loadError = false)}>Try again</button></p>
  {:else if !story}
    <p class="muted">Loading…</p>
  {:else}
    <header class="hero">
      <div class="glyph-wrap">
        {#if strokeError}
          <div class="glyph-static" lang="zh-CN" aria-label={`The character ${char}`}>{char}</div>
        {:else}
          <div class="glyph" bind:this={hero} aria-label={`The character ${char}, animated stroke by stroke`}></div>
          <button class="replay" onclick={replay} aria-label="Replay strokes">↻</button>
        {/if}
      </div>
      <div class="hero-meta">
        {#if story.pinyin}<p class="pinyin">{story.pinyin}</p>{/if}
        {#if story.definition}<p class="definition">{story.definition}</p>{/if}
        {#if story.radical}
          <p class="radical">
            Radical <button class="radical-chip" lang="zh-CN" onclick={() => onOpenStory(story.radical!)}>{story.radical}</button>
            {#if story.radicalGloss}<span>· {story.radicalGloss}</span>{/if}
          </p>
        {/if}
      </div>
    </header>

    {#if forms.length}
      <section class="evolution" aria-label="How the character evolved">
        <h3>How it evolved</h3>
        <div class="timeline">
          {#each forms as form (form.era)}
            <figure class="era">
              <div class="era-glyph"><img src={form.url} alt={`${char} in ${form.label} script`} loading="lazy" /></div>
              <figcaption>{form.label}<span lang="zh-CN">{form.cn}</span></figcaption>
            </figure>
            <span class="arrow" aria-hidden="true">→</span>
          {/each}
          <figure class="era">
            <div class="era-glyph modern" lang="zh-CN">{char}</div>
            <figcaption>Today<span lang="zh-CN">楷書</span></figcaption>
          </figure>
        </div>
        <small class="credit">Ancient forms: public-domain 古漢字 project, Wikimedia Commons.</small>
      </section>
    {/if}

    {#if story.components.length >= 2}
      <section class="parts" aria-label="What it's built from">
        <h3>Built from</h3>
        <div class="part-row">
          {#each story.components as part, i (part.char + i)}
            <button class="part" data-role={part.role} lang="zh-CN" onclick={() => onOpenStory(part.char)}>
              <span class="part-char">{part.char}</span>
              <span class="part-gloss">{part.gloss ?? '—'}</span>
              <span class="part-role">{roleLabel[part.role]}</span>
            </button>
            {#if i < story.components.length - 1}<span class="plus" aria-hidden="true">+</span>{/if}
          {/each}
        </div>
      </section>
    {/if}

    {#if story.etymology}
      <section class="ety">
        <h3>Where it comes from</h3>
        <p lang="zh-CN">{story.etymology}</p>
      </section>
    {/if}

    <div class="actions">
      <button class="trace" onclick={() => (showTrace = !showTrace)} aria-expanded={showTrace}>
        {showTrace ? 'Hide tracing' : '✍ Trace this character'}
      </button>
    </div>
    {#if showTrace}
      {#key char}
        <WritingPractice word={char} />
      {/key}
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

  .story {
    display: grid;
    gap: 20px;
    max-width: 760px;
    margin: 0 auto;
  }

  .back {
    justify-self: start;
    padding: 7px 14px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-pill, 999px);
    background: var(--mandarin-raised);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }

  .back:hover {
    border-color: var(--accent-primary);
    color: var(--text-primary);
  }

  .hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: clamp(16px, 4vw, 32px);
  }

  .glyph-wrap {
    position: relative;
    flex: 0 0 auto;
  }

  .glyph,
  .glyph-static {
    width: 200px;
    height: 200px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius, 12px);
    background: var(--bg-primary);
    /* 田字格 quadrant guides, like the tracing grid */
    background-image:
      linear-gradient(to right, color-mix(in srgb, var(--border-primary) 55%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--border-primary) 55%, transparent) 1px, transparent 1px);
    background-position: center;
    background-size: 50% 50%;
  }

  .glyph-static {
    display: grid;
    place-items: center;
    font-family: var(--font-han, sans-serif);
    font-size: 128px;
    line-height: 1;
    color: var(--text-primary);
  }

  .replay {
    position: absolute;
    right: 6px;
    bottom: 6px;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid var(--border-primary);
    border-radius: 999px;
    background: var(--mandarin-raised);
    color: var(--accent-primary);
    font-size: 16px;
  }
  .replay:hover {
    border-color: var(--accent-primary);
  }

  .hero-meta {
    flex: 1 1 220px;
    min-width: 0;
    display: grid;
    gap: 6px;
  }

  .pinyin {
    margin: 0;
    color: var(--accent-primary);
    font-family: var(--font-display, inherit);
    font-size: clamp(22px, 3vw, 30px);
    font-weight: 800;
  }

  .definition {
    margin: 0;
    color: var(--text-primary);
    font-size: 16px;
    line-height: 1.4;
  }

  .radical {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .radical-chip {
    padding: 1px 8px;
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    background: var(--mandarin-raised);
    color: var(--text-primary);
    font-family: var(--font-han, sans-serif);
    font-size: 15px;
  }
  .radical-chip:hover {
    border-color: var(--accent-primary);
  }

  h3 {
    margin: 0 0 10px;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: 15px;
    font-weight: 800;
  }

  .evolution {
    display: grid;
    gap: 10px;
  }

  .timeline {
    display: flex;
    align-items: center;
    gap: 6px;
    overflow-x: auto;
    padding-bottom: 4px;
  }

  .era {
    flex: 0 0 auto;
    margin: 0;
    display: grid;
    justify-items: center;
    gap: 6px;
  }

  /* Fixed warm-paper tile in both themes: the ancient SVGs are black ink on
     transparent, so they'd vanish on a dark surface. Reads like a museum card. */
  .era-glyph {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    padding: 8px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius-sm, 8px);
    background: #f4f6f1;
    color: #1a211c;
  }
  .era-glyph img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .era-glyph.modern {
    font-family: var(--font-han, sans-serif);
    font-size: 44px;
    line-height: 1;
  }

  .era figcaption {
    display: grid;
    justify-items: center;
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 700;
    text-align: center;
  }
  .era figcaption span {
    color: var(--text-tertiary);
    font-family: var(--font-han, inherit);
    font-weight: 600;
  }

  .timeline .arrow {
    flex: 0 0 auto;
    color: var(--text-tertiary);
    font-size: 16px;
  }

  .credit {
    color: var(--text-tertiary);
    font-size: 11px;
  }

  .part-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .part {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 92px;
    padding: 12px 14px;
    border: 1px solid var(--border-primary);
    border-radius: var(--radius, 12px);
    background: var(--mandarin-raised);
    color: var(--text-primary);
    transition: transform 120ms ease, border-color 120ms ease;
  }
  .part:hover {
    transform: translateY(-1px);
    border-color: var(--accent-primary);
  }
  .part[data-role='semantic'] {
    border-left: 3px solid var(--accent-primary);
  }
  .part[data-role='phonetic'] {
    border-left: 3px solid var(--accent-light);
  }

  .part-char {
    font-family: var(--font-han, sans-serif);
    font-size: 34px;
    line-height: 1;
  }
  .part-gloss {
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }
  .part-role {
    color: var(--text-tertiary);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .plus {
    color: var(--text-tertiary);
    font-size: 20px;
    font-weight: 700;
  }

  .ety p {
    margin: 0;
    max-width: 620px;
    color: var(--text-secondary);
    font-size: 15px;
    line-height: 1.5;
  }

  .actions {
    display: flex;
    gap: 10px;
  }

  .trace {
    min-height: 44px;
    padding: 0 18px;
    border: 1px solid color-mix(in srgb, var(--accent-primary) 40%, var(--border-primary));
    border-radius: var(--radius, 12px);
    background: color-mix(in srgb, var(--accent-primary) 8%, var(--mandarin-raised));
    color: var(--accent-primary);
    font-weight: 800;
  }
  .trace:hover {
    background: color-mix(in srgb, var(--accent-primary) 15%, var(--mandarin-raised));
  }

  .muted {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .link {
    background: none;
    color: var(--accent-primary);
    font-weight: 700;
    text-decoration: underline;
  }

  @media (max-width: 480px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
