<script lang="ts">
  import { festivalWhen, type UpcomingFestival } from '../logic/festivals';
  import { findMandarinVoice } from '../../utils/mandarinBrowserVoice';

  let { upcoming }: { upcoming: UpcomingFestival } = $props();

  let f = $derived(upcoming.festival);
  let when = $derived(festivalWhen(upcoming.daysUntil));

  // Tap-to-hear the greeting via the browser's Mandarin voice. Only offered when
  // a real Mandarin voice exists — never a button that silently does nothing.
  let voice = $state<SpeechSynthesisVoice | null>(null);
  let speaking = $state(false);

  $effect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    let alive = true;
    void findMandarinVoice(window.speechSynthesis).then((v) => {
      if (alive) voice = v as SpeechSynthesisVoice | null;
    });
    return () => {
      alive = false;
      window.speechSynthesis?.cancel();
    };
  });

  function speakGreeting() {
    if (!f.greeting || !voice || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(f.greeting.hanzi);
    u.voice = voice;
    u.lang = voice.lang || 'zh-CN';
    u.rate = 0.92;
    u.onend = () => (speaking = false);
    u.onerror = () => (speaking = false);
    speaking = true;
    window.speechSynthesis.speak(u);
  }
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
        {#if voice}
          <button
            class="say"
            onclick={speakGreeting}
            aria-label={`Hear ${f.greeting.hanzi}`}
            data-speaking={speaking}
          >▶</button>
        {/if}
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

  .say {
    display: inline-grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border: 1px solid color-mix(in srgb, var(--mandarin-red) 40%, var(--border-primary));
    border-radius: 999px;
    background: color-mix(in srgb, var(--mandarin-red) 12%, transparent);
    color: var(--mandarin-red);
    font-size: 11px;
    cursor: pointer;
    transition: background-color 120ms ease;
  }
  .say:hover,
  .say[data-speaking='true'] {
    background: color-mix(in srgb, var(--mandarin-red) 22%, transparent);
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
