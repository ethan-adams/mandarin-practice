<script lang="ts">
  import HanziWriter from 'hanzi-writer';
  import { charactersToPractice, hanziDataPath } from '../../utils/hanziChars';

  let { word }: { word: string } = $props();

  let chars = $derived(charactersToPractice(word));
  let index = $state(0);
  let mistakes = $state(0);
  let totalMistakes = $state(0);
  let complete = $state(false);
  let dataError = $state(false);
  let target = $state<HTMLDivElement | null>(null);

  let currentChar = $derived(chars[index] ?? '');
  let writer: HanziWriter | null = null;

  const quizConfig = {
    showHintAfterMisses: 2,
    onMistake: () => {
      mistakes += 1;
      totalMistakes += 1;
    },
    onComplete: () => advance(),
  };

  function advance() {
    if (index < chars.length - 1) index += 1;
    else complete = true;
  }

  function showStrokes() {
    void writer?.animateCharacter();
  }

  function retryChar() {
    if (!writer) return;
    mistakes = 0;
    void writer.quiz(quizConfig);
  }

  function skip() {
    advance();
  }

  function practiceAgain() {
    index = 0;
    complete = false;
    totalMistakes = 0;
  }

  // Re-create the writer whenever the target mounts or the character changes.
  // Reads only `target`/`currentChar`, so advancing the index (which changes
  // currentChar) re-runs this cleanly without a reactive loop.
  $effect(() => {
    const el = target;
    const char = currentChar;
    if (!el || !char || complete) return;
    el.innerHTML = '';
    mistakes = 0;
    dataError = false;

    const created = HanziWriter.create(el, char, {
      width: 260,
      height: 260,
      padding: 8,
      showCharacter: false,
      showOutline: true,
      strokeColor: '#b3323a',
      outlineColor: '#c9ccd1',
      drawingColor: '#2c6f9f',
      charDataLoader: (c: string) =>
        fetch(hanziDataPath(c)).then((r) => {
          if (!r.ok) throw new Error(`stroke data ${r.status}`);
          return r.json();
        }),
      onLoadCharDataError: () => {
        dataError = true;
      },
    });
    writer = created;
    void created.quiz(quizConfig);

    return () => {
      el.innerHTML = '';
      writer = null;
    };
  });
</script>

<div class="writing">
  {#if chars.length === 0}
    <p class="muted">No characters to trace here.</p>
  {:else if complete}
    <div class="done">
      <p class="done-line" lang="zh-CN">{chars.join('')}</p>
      <p class="muted">
        Nicely done — {totalMistakes === 0 ? 'a clean pass, no misses.' : `${totalMistakes} miss${totalMistakes === 1 ? '' : 'es'} across ${chars.length} character${chars.length === 1 ? '' : 's'}.`}
      </p>
      <button class="primary" onclick={practiceAgain}>Practice again</button>
    </div>
  {:else}
    <div class="head">
      <span class="counter">Character {index + 1} of {chars.length}</span>
      {#if mistakes > 0}<span class="miss">{mistakes} miss{mistakes === 1 ? '' : 'es'}</span>{/if}
    </div>

    <div class="stage">
      <div class="grid-frame">
        <div class="target" bind:this={target} aria-label={`Trace the character ${currentChar}`}></div>
      </div>
    </div>

    {#if dataError}
      <p class="muted">Stroke data for this character isn’t available. You can skip it.</p>
    {/if}

    <div class="controls">
      <button class="ghost" onclick={showStrokes}>Show strokes</button>
      <button class="ghost" onclick={retryChar}>Start over</button>
      <button class="ghost" onclick={skip}>{index < chars.length - 1 ? 'Skip' : 'Finish'}</button>
    </div>
  {/if}
</div>

<style>
  .writing {
    margin-top: 18px;
    padding: 16px;
    border: 1px solid var(--border-primary);
    border-radius: 10px;
    background: color-mix(in srgb, var(--bg-primary) 74%, var(--bg-secondary));
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .counter {
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 840;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .miss {
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 760;
  }

  .stage {
    display: flex;
    justify-content: center;
  }

  .grid-frame {
    position: relative;
    width: 260px;
    height: 260px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--bg-primary);
    /* Faint quadrant guide lines, like a 田字格 writing grid. */
    background-image:
      linear-gradient(to right, color-mix(in srgb, var(--border-primary) 60%, transparent) 1px, transparent 1px),
      linear-gradient(to bottom, color-mix(in srgb, var(--border-primary) 60%, transparent) 1px, transparent 1px);
    background-position: center;
    background-size: 50% 50%;
  }

  .target {
    position: absolute;
    inset: 0;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  button {
    min-height: 40px;
    padding: 0 15px;
    border: 0;
    border-radius: 8px;
    cursor: pointer;
    font: inherit;
    font-weight: 800;
  }

  .ghost {
    border: 1px solid var(--border-primary);
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .primary {
    background: var(--mandarin-red);
    color: #fff;
  }

  .done {
    display: grid;
    justify-items: start;
    gap: 8px;
  }

  .done-line {
    margin: 0;
    font-size: 44px;
    font-weight: 860;
    color: var(--text-primary);
  }

  .muted {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13.5px;
  }
</style>
