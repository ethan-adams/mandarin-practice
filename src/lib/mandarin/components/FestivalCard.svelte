<script lang="ts">
  import { festivalWhen, type UpcomingFestival } from '../logic/festivals';

  let { upcoming }: { upcoming: UpcomingFestival } = $props();

  let f = $derived(upcoming.festival);
  let when = $derived(festivalWhen(upcoming.daysUntil));
</script>

<section class="festival" aria-label={`${f.english} — ${when}`}>
  <div class="glyph" lang="zh-CN" aria-hidden="true">{f.hanzi}</div>
  <div class="body">
    <span class="kicker">Festival · {when}</span>
    <h2>{f.english}</h2>
    <p class="name"><span lang="zh-CN">{f.hanzi}</span> · {f.pinyin}</p>
    <p class="blurb">{f.blurb}</p>
    {#if f.greeting}
      <p class="greeting">
        <span class="greeting-hanzi" lang="zh-CN">{f.greeting.hanzi}</span>
        <span class="greeting-pinyin">{f.greeting.pinyin}</span>
        <span class="greeting-gloss">“{f.greeting.gloss}”</span>
      </p>
    {/if}
  </div>
</section>

<style>
  .festival {
    display: flex;
    align-items: center;
    gap: clamp(16px, 3vw, 28px);
    padding: clamp(16px, 3vw, 24px);
    border: 1px solid color-mix(in srgb, var(--mandarin-red) 34%, var(--border-primary));
    border-left: 3px solid var(--mandarin-red);
    border-radius: var(--radius-lg, 18px);
    background:
      linear-gradient(120deg, color-mix(in srgb, var(--mandarin-red) 9%, transparent), transparent 62%),
      var(--mandarin-raised);
  }

  .glyph {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: clamp(84px, 14vw, 120px);
    height: clamp(84px, 14vw, 120px);
    border-radius: var(--radius, 12px);
    background: color-mix(in srgb, var(--mandarin-red) 12%, var(--bg-primary));
    color: var(--mandarin-red);
    font-family: var(--font-brush, var(--font-han, serif));
    font-size: clamp(40px, 8vw, 64px);
    line-height: 1;
  }

  .body {
    min-width: 0;
    display: grid;
    gap: 4px;
  }

  .kicker {
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 820;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  h2 {
    margin: 2px 0 0;
    color: var(--text-primary);
    font-family: var(--font-display, inherit);
    font-size: clamp(20px, 2.6vw, 26px);
    font-weight: 800;
    line-height: 1.12;
  }

  .name {
    margin: 0;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 700;
  }
  .name span[lang] {
    font-family: var(--font-han, inherit);
  }

  .blurb {
    margin: 6px 0 0;
    max-width: 640px;
    color: var(--text-secondary);
    font-size: 14.5px;
    line-height: 1.5;
  }

  .greeting {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin: 10px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--border-primary);
  }

  .greeting-hanzi {
    font-family: var(--font-han, inherit);
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
  }
  .greeting-pinyin {
    color: var(--accent-primary);
    font-size: 14px;
    font-weight: 700;
  }
  .greeting-gloss {
    color: var(--text-tertiary);
    font-size: 13px;
  }

  @media (max-width: 560px) {
    .festival {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>
