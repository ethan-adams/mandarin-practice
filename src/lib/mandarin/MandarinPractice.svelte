<script lang="ts">
  import { onMount } from 'svelte';
  import type { Rating } from './logic/srs';
  import { PracticeSession, type Mode } from './state/session.svelte';
  import { PracticeSettings } from './state/settings.svelte';
  import { SpeechController } from './state/speech.svelte';
  import { ToneCoachController } from './state/toneCoach.svelte';
  import { ListeningStore } from './state/listening.svelte';
  import { EvidenceStore } from './state/evidence.svelte';
  import { AccountController } from '../account/accountController.svelte';
  import PracticeSidebar from './components/PracticeSidebar.svelte';
  import CardPractice from './components/CardPractice.svelte';
  import CourseHome from './components/CourseHome.svelte';
  import ListeningPractice from './components/ListeningPractice.svelte';
  import SessionSummary from './components/SessionSummary.svelte';
  import AccountPanel from './components/AccountPanel.svelte';

  const settings = new PracticeSettings();
  const session = new PracticeSession(() => toneCoach.reset());
  const toneCoach = new ToneCoachController(
    () => session.currentCard ?? null,
    () => session.showAnswer,
  );
  const speech = new SpeechController(settings, () => session.currentCard ?? null);
  const listening = new ListeningStore();
  const evidence = new EvidenceStore();
  // After a pulled merge rewrites localStorage, re-hydrate the in-memory stores
  // so the newly-synced progress shows without a page reload.
  const account = new AccountController(() => {
    session.loadState();
    evidence.load();
    listening.load();
  });

  function reveal() {
    if (!session.currentCard) return;
    toneCoach.stopRecognition();
    toneCoach.stopToneAssessment(false);
    session.showAnswer = true;
    if (settings.autoSpeak) void speech.speakAnswer();
  }

  function rate(rating: Rating) {
    if (!session.currentCard) return;
    evidence.record(toneCoach.characterFeedback, toneCoach.recognitionResult, rating);
    session.rate(rating);
  }

  function setMode(mode: Mode) {
    session.setMode(mode);
  }

  function beginContrastDrill(pairId: string) {
    session.practiceView = 'cards';
    evidence.beginDrill(pairId);
  }

  async function playDrillCue(kind: 'target' | 'contrast') {
    const pair = evidence.activeDrillPair;
    if (!evidence.activeDrill || !pair) return;
    const cue = kind === 'target' ? pair.target : pair.contrast;
    if (!(await speech.playContrastCue(cue))) return;
    evidence.updateDrill(kind === 'target' ? 'target_played' : 'contrast_played');
  }

  async function playListeningPrompt() {
    await speech.playContrastCue(listening.currentCue, {
      onAudioUnavailable: () => listening.markAudioUnavailable(),
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (
      event.target instanceof HTMLButtonElement ||
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLSelectElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLAnchorElement
    ) return;
    if (session.practiceView === 'home') return;
    if (session.practiceView === 'summary') {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (session.selectedCards.length) session.keepGoing();
        else session.goHome();
      }
      return;
    }
    if (session.practiceView === 'listening') {
      if (!listening.round.revealed && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void playListeningPrompt();
      } else if (!listening.round.revealed && (event.key === '1' || event.key === '2')) {
        event.preventDefault();
        listening.choose(event.key === '1' ? listening.currentPair.target.id : listening.currentPair.contrast.id);
      } else if (!listening.round.revealed && event.key === 'Enter') {
        event.preventDefault();
        listening.reveal();
      } else if (listening.round.revealed && ['1', '2', '3'].includes(event.key)) {
        event.preventDefault();
        listening.rateConfidence(({ '1': 'low', '2': 'medium', '3': 'high' } as const)[event.key as '1' | '2' | '3']);
      }
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!session.showAnswer) reveal();
    }
    if (!session.showAnswer) return;
    if (event.key === '1') rate('wrong');
    if (event.key === '2') rate('hard');
    if (event.key === '3') rate('correct');
  }

  function handlePopstate() {
    session.onPopstate();
  }

  $effect(() => {
    if (session.currentIndex >= session.selectedCards.length) {
      session.currentIndex = Math.max(session.selectedCards.length - 1, 0);
    }
  });

  onMount(() => {
    // One-time hydration from localStorage. Never wrap this in $effect: it
    // writes state it also reads (listening results), which loops the effect
    // until Svelte aborts with effect_update_depth_exceeded and the page hangs.
    session.loadState();
    evidence.load();
    listening.load();
    account.load();
    toneCoach.init();
    void session.loadCorpus();
    session.syncCardFromPath();

    return () => {
      toneCoach.stopRecognition();
      toneCoach.stopToneAssessment(false);
      speech.dispose();
    };
  });
</script>

<svelte:window onkeydown={handleKeydown} onpopstate={handlePopstate} />

<section class="mandarin-shell">
  <header class="practice-header">
    <div class="practice-title">
      <span class="eyebrow">Mandarin Practice</span>
      <h1>Call and response trainer</h1>
    </div>
  </header>

  <!-- The live region stays mounted so screen readers reliably announce the
       failure text when it appears; the retry button sits outside the region
       so its label swap is not re-announced as noise. -->
  <div class="corpus-banner" class:active={session.corpusLoadFailed}>
    <span role="status" aria-label="Practice deck status">
      {session.corpusLoadFailed ? `Practice deck failed to load - using ${session.fallbackCards.length} built-in cards.` : ''}
    </span>
    {#if session.corpusLoadFailed}
      <button type="button" onclick={() => void session.loadCorpus()} disabled={session.corpusLoading}>
        {session.corpusLoading ? 'Retrying…' : 'Retry'}
      </button>
    {/if}
  </div>

  {#if session.practiceView === 'home'}
    <CourseHome
      {session}
      onContinue={() => session.startContinue()}
      onStartUnit={(lessonId) => session.startUnit(lessonId)}
      onStartSection={(lessonIds, label) => session.startSection(lessonIds, label)}
      onQuickMode={(mode) => session.startGlobal(mode)}
      onShowListening={() => session.showListeningPractice()}
    />
  {:else}
    <div class="practice-layout">
      <PracticeSidebar
        {session}
        {settings}
        {speech}
        {evidence}
        onGoHome={() => session.goHome()}
        onSetMode={setMode}
        onShowListening={() => session.showListeningPractice()}
        onSelectCard={(index) => session.selectCard(index)}
        onBeginDrill={beginContrastDrill}
      />

      <article class="practice-card">
        {#if session.practiceView === 'listening'}
          <ListeningPractice {listening} onPlayPrompt={() => void playListeningPrompt()} />
        {:else if session.practiceView === 'summary'}
          <SessionSummary {session} onKeepGoing={() => session.keepGoing()} onGoHome={() => session.goHome()} />
        {:else if session.currentCard}
          <CardPractice
            {session}
            {settings}
            {speech}
            {toneCoach}
            {evidence}
            onRate={rate}
            onReveal={reveal}
            onBeginDrill={beginContrastDrill}
            onPlayDrillCue={(kind) => void playDrillCue(kind)}
          />
        {:else}
          <div class="empty-state">
            <h2>No cards here yet</h2>
            <p>This filter has no cards right now. Head back to the course to pick another unit or mode.</p>
            <button class="empty-back" onclick={() => session.goHome()}>Back to course</button>
          </div>
        {/if}
      </article>
    </div>
  {/if}

  <AccountPanel {account} />

  <footer class="practice-footer">
    <button onclick={() => session.resetDemo()}>Reset progress</button>
    <button onclick={() => evidence.clear()}>Clear pronunciation evidence</button>
    <p>{session.corpusLoaded ? `${session.corpusLessonCount} lessons loaded. Review history stays in this browser.` : 'Demo fallback loaded. Review history stays in this browser.'}</p>
  </footer>
</section>

<style>
  .mandarin-shell {
    --mandarin-red: #b3323a;
    --mandarin-red-dark: #8d2730;
    --mandarin-blue: #2c6f9f;
    --mandarin-gold: #a56f2b;
    --mandarin-panel: color-mix(in srgb, var(--bg-secondary) 78%, var(--bg-primary));
    --mandarin-raised: color-mix(in srgb, var(--bg-primary) 72%, var(--bg-secondary));
    min-height: auto;
    padding: 2px 0 18px;
    background: transparent;
    color: var(--text-primary);
  }

  button {
    border: 0;
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
  }

  .practice-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    max-width: 1280px;
    margin: 0 auto 12px;
    padding: 6px 0 10px;
  }

  /* Always mounted (empty) so the aria-live region announces reliably;
     only .active renders a visible banner box. */
  .corpus-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    max-width: 1280px;
    margin: 0 auto;
  }

  .corpus-banner.active {
    margin-bottom: 12px;
    padding: 8px 12px;
    border: 1px solid var(--mandarin-gold);
    border-left-width: 3px;
    border-radius: 8px;
    background: var(--mandarin-panel);
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .corpus-banner button {
    flex: 0 0 auto;
    padding: 3px 12px;
    border: 1px solid var(--border-primary);
    border-radius: 999px;
    background: var(--bg-tertiary);
    color: var(--text-secondary);
    font-size: 0.78rem;
    cursor: pointer;
  }

  .corpus-banner button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .practice-title {
    min-width: 0;
  }

  .eyebrow {
    display: block;
    color: var(--mandarin-red);
    font-size: 11px;
    font-weight: 820;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .practice-title h1 {
    margin: 5px 0 0;
    color: var(--text-primary);
    font-size: clamp(28px, 3.4vw, 48px);
    line-height: 0.98;
    letter-spacing: 0;
  }

  .practice-layout {
    display: grid;
    grid-template-columns: minmax(286px, 352px) minmax(0, 1fr);
    gap: 18px;
    max-width: 1280px;
    margin: 0 auto;
  }

  .practice-card {
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: var(--mandarin-raised);
    box-shadow: var(--shadow-sm);
    min-height: calc(100vh - 168px);
    padding: clamp(22px, 3.4vw, 42px);
    display: flex;
    flex-direction: column;
    /* Top-aligned: vertical centering left a large dead zone above the card
       content on tall desktop viewports. */
    justify-content: flex-start;
    overflow: hidden;
  }

  .empty-state h2 {
    margin: 0 0 8px;
    font-size: 28px;
  }

  .empty-state p {
    margin: 0;
    color: var(--text-secondary);
  }

  .empty-back {
    justify-self: start;
    margin-top: 14px;
    min-height: 42px;
    padding: 0 18px;
    border-radius: 8px;
    background: var(--mandarin-red);
    color: white;
    font-weight: 820;
  }

  .empty-state {
    display: grid;
    justify-items: start;
  }

  .practice-footer {
    max-width: 1280px;
    margin: 12px auto 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .practice-footer button {
    min-height: 40px;
    padding: 0 14px;
    border: 1px solid var(--border-primary);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
    color: var(--text-primary);
    font-weight: 800;
  }

  .practice-footer p {
    margin: 0;
  }

  @media (max-width: 920px) {
    .practice-layout {
      grid-template-columns: 1fr;
    }

    .practice-card {
      min-height: 430px;
    }

    .practice-footer {
      align-items: flex-start;
      flex-direction: column;
      gap: 10px;
    }

    .practice-footer p {
      margin-top: 0;
    }
  }

  @media (max-width: 560px) {
    .mandarin-shell {
      padding-top: 0;
    }

    .practice-title h1 {
      font-size: 30px;
    }

    .practice-card {
      border-radius: 8px;
    }
  }
</style>
