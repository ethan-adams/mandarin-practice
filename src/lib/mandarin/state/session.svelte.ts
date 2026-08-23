// The practice session: deck (with visible-failure corpus loading), SRS review
// state, mode/view selection, card navigation, and /mandarin/<card> URL sync.
// Pronunciation-capture state lives in ToneCoachController; this class calls
// the injected onReset callback on every card change so a switch never leaks a
// stale transcript or verdict from the previous card.

import { MANDARIN_FALLBACK_CARDS } from '../data/mandarinFallbackCards';
import { fetchMandarinCorpus, type Card, type DeckUnit } from '../logic/deck';
import {
  applyRating,
  clearReviewState,
  defaultCardState,
  isDue,
  loadReviewState,
  saveReviewState,
  type CardState,
  type Rating,
} from '../logic/srs';
import { loadPracticeDays, recordPracticeDay, savePracticeDays } from '../logic/sessionStats';
import { lessonLabel } from '../logic/lessons';

// 'weak' = seen AND due (genuine weak spots), distinct from 'due' which also
// counts never-seen cards as available. Powers the home's "Strengthen" entry.
export type Mode = 'due' | 'new' | 'all' | 'weak';
export type PracticeView = 'home' | 'cards' | 'listening' | 'summary' | 'journey' | 'story' | 'you';

/** Cards per session batch before the summary offers a break. */
export const SESSION_BATCH = 15;

export class PracticeSession {
  cards = $state<Card[]>(MANDARIN_FALLBACK_CARDS);
  corpusCardCount = $state(MANDARIN_FALLBACK_CARDS.length);
  corpusLessonCount = $state(2);
  corpusLoaded = $state(false);
  corpusLoadFailed = $state(false);
  corpusLoading = $state(false);
  /** Course structure shipped with the deck; null on the fallback deck. */
  deckUnits = $state<DeckUnit[] | null>(null);
  reviewState = $state<Record<string, CardState>>({});
  mode = $state<Mode>('due');
  practiceView = $state<PracticeView>('home');
  currentIndex = $state(0);
  showAnswer = $state(false);
  /** When set, practice is scoped to these lesson ids (one lesson, a whole HSK
   * level, or the Preply track). Null means the whole deck. */
  scopeLessons = $state<Set<string> | null>(null);
  /** Human label for the current scope, shown in the sidebar. */
  scopeLabel = $state('');
  /** True while a bounded practice session (started from the course) runs. */
  sessionActive = $state(false);
  /** Ratings given this session, in order. */
  sessionRatings = $state<Rating[]>([]);
  sessionTarget = $state(SESSION_BATCH);
  /** Ratings count at the start of the current batch (last keep-going). */
  sessionBatchStart = $state(0);
  /** Days with at least one rating; feeds the summary's streak. */
  practiceDays = $state<string[]>([]);
  /** Character whose story is open (Character Story view); null otherwise. */
  storyChar = $state<string | null>(null);
  /** View to return to when the Character Story closes. */
  storyReturn = $state<PracticeView>('home');

  readonly fallbackCards = MANDARIN_FALLBACK_CARDS;

  selectedCards = $derived(this.cardsForMode());
  currentCard = $derived(this.selectedCards[this.currentIndex] ?? this.selectedCards[0]);
  currentState = $derived(this.currentCard ? { ...defaultCardState(), ...this.reviewState[this.currentCard.id] } : null);
  attempted = $derived(this.cards.filter((card) => (this.reviewState[card.id]?.attempts ?? 0) > 0).length);
  dueCount = $derived(this.cards.filter((card) => this.due(card)).length);
  newCount = $derived(this.cards.filter((card) => (this.reviewState[card.id]?.attempts ?? 0) === 0).length);
  /** Seen cards that are due again — genuine weak spots for "Strengthen". */
  weakCount = $derived(this.cards.filter((card) => (this.reviewState[card.id]?.attempts ?? 0) > 0 && this.due(card)).length);
  /**
   * Cards planned for this session: the batch target, capped by what the
   * current mode can still serve. In due/new modes rated cards leave the
   * queue, so "remaining" is the queue itself; in all mode rated cards stay,
   * so the rough remainder subtracts what was already done.
   */
  sessionPlanned = $derived.by(() => {
    // In 'all' mode rated cards stay in the queue, so "remaining" counts the
    // cards not yet rated within the CURRENT batch - a keep-going after a
    // full pass then plans a real re-review pass instead of degenerating to
    // one-card batches.
    const remaining =
      this.mode === 'all'
        ? Math.max(this.selectedCards.length - (this.sessionRatings.length - this.sessionBatchStart), 0)
        : this.selectedCards.length;
    return Math.min(this.sessionTarget, this.sessionRatings.length + remaining);
  });
  sessionProgress = $derived.by(() => {
    if (this.sessionActive) {
      return this.sessionPlanned ? Math.round(((this.sessionRatings.length + (this.showAnswer ? 0.5 : 0)) / this.sessionPlanned) * 100) : 0;
    }
    return this.selectedCards.length
      ? Math.round(((this.currentIndex + (this.showAnswer ? 0.5 : 0)) / this.selectedCards.length) * 100)
      : 0;
  });

  readonly #onReset: () => void;

  constructor(onReset: () => void) {
    this.#onReset = onReset;
  }

  loadState() {
    this.reviewState = loadReviewState();
    this.practiceDays = loadPracticeDays();
  }

  saveState() {
    saveReviewState(this.reviewState);
  }

  due(card: Card) {
    return isDue(this.reviewState[card.id]);
  }

  cardsForMode(nextMode = this.mode, scope = this.scopeLessons) {
    return this.cards.filter((card) => {
      if (scope && !scope.has(card.lessonId)) return false;
      const item = this.reviewState[card.id];
      if (nextMode === 'new') return !item || item.attempts === 0;
      if (nextMode === 'weak') return (item?.attempts ?? 0) > 0 && this.due(card);
      if (nextMode === 'due') return this.due(card);
      return true;
    });
  }

  setMode(nextMode: Mode) {
    this.practiceView = 'cards';
    this.mode = nextMode;
    this.currentIndex = 0;
    this.showAnswer = false;
    // Every intentional practice start (Continue, a unit, a mode button)
    // begins a fresh bounded session; deep links bypass this path and browse
    // unbounded, exactly as before.
    this.sessionActive = true;
    this.sessionRatings = [];
    this.sessionTarget = SESSION_BATCH;
    this.sessionBatchStart = 0;
    this.#onReset();
    const nextCard = this.cardsForMode(nextMode)[0];
    if (nextCard) this.syncPathToCard(nextCard);
  }

  /** Continue past a session summary with another batch. */
  keepGoing() {
    this.sessionTarget += SESSION_BATCH;
    this.sessionBatchStart = this.sessionRatings.length;
    this.practiceView = 'cards';
    this.showAnswer = false;
    this.#onReset();
    const nextCard = this.selectedCards[this.currentIndex];
    if (nextCard) this.syncPathToCard(nextCard);
  }

  showListeningPractice() {
    this.practiceView = 'listening';
    this.showAnswer = false;
    this.#onReset();
  }

  /** Course home "Continue": the whole deck, due-first when anything is due. */
  startContinue() {
    this.scopeLessons = null;
    this.scopeLabel = '';
    this.setMode(this.cardsForMode('due', null).length ? 'due' : 'all');
  }

  /** Start practice scoped to one lesson, due/new cards first when any exist. */
  startUnit(lessonId: string) {
    const scope = new Set([lessonId]);
    this.scopeLessons = scope;
    this.scopeLabel = lessonLabel(lessonId);
    this.setMode(this.cardsForMode('due', scope).length ? 'due' : 'all');
  }

  /** Start practice scoped to a whole level/track (many lessons at once). */
  startSection(lessonIds: string[], label: string) {
    const scope = new Set(lessonIds);
    this.scopeLessons = scope;
    this.scopeLabel = label;
    this.setMode(this.cardsForMode('due', scope).length ? 'due' : 'all');
  }

  /** Course home quick modes practice the whole deck, never a stale unit scope. */
  startGlobal(mode: Mode) {
    this.scopeLessons = null;
    this.scopeLabel = '';
    this.setMode(mode);
  }

  /** "Strengthen": practice only genuine weak spots (seen and due). */
  startStrengthen() {
    this.startGlobal('weak');
  }

  goHome() {
    this.practiceView = 'home';
    this.showAnswer = false;
    this.#onReset();
    if (window.location.pathname !== '/mandarin') {
      window.history.pushState({}, '', '/mandarin');
    }
  }

  /** The Journey map (progress by character; no due dates). */
  showJourney() {
    this.practiceView = 'journey';
    this.showAnswer = false;
    this.#onReset();
  }

  /** The You surface: account, preferences, and data controls. */
  showYou() {
    this.practiceView = 'you';
    this.showAnswer = false;
    this.#onReset();
  }

  /** Open a character's story; remembers where to return on close. */
  showStory(char: string, from: PracticeView = this.practiceView) {
    this.storyChar = char;
    // Never return into a transient story view; fall back to the Journey/home hub.
    this.storyReturn = from === 'story' ? 'journey' : from;
    this.practiceView = 'story';
    this.showAnswer = false;
    this.#onReset();
  }

  closeStory() {
    this.practiceView = this.storyReturn;
    this.storyChar = null;
  }

  selectCard(index: number) {
    // Picking a card from the queue always lands in card practice - from the
    // summary view this resumes the session at the chosen card.
    this.practiceView = 'cards';
    this.currentIndex = index;
    this.showAnswer = false;
    this.#onReset();
    const nextCard = this.selectedCards[index];
    if (nextCard) this.syncPathToCard(nextCard);
  }

  rate(rating: Rating) {
    if (!this.currentCard) return;
    // Scheduler semantics are applyRating's alone; the session layer below
    // only observes ratings, never changes them.
    this.reviewState = { ...this.reviewState, [this.currentCard.id]: applyRating(this.reviewState[this.currentCard.id], rating) };
    this.saveState();
    const days = recordPracticeDay(this.practiceDays);
    if (days !== this.practiceDays) {
      this.practiceDays = days;
      savePracticeDays(days);
    }
    this.showAnswer = false;
    this.#onReset();
    const nextCards = this.cardsForMode();
    this.currentIndex = Math.min(this.currentIndex + 1, Math.max(nextCards.length - 1, 0));
    const nextCard = nextCards[this.currentIndex];
    if (nextCard) this.syncPathToCard(nextCard);

    if (this.sessionActive) {
      this.sessionRatings = [...this.sessionRatings, rating];
      // Batch boundary or queue exhausted: pause on the summary. The planned
      // count (not the raw target) is the boundary - in 'all' mode rated
      // cards never leave the queue, so a small unit would otherwise loop
      // the last card forever without ever reaching its summary.
      if (this.sessionRatings.length >= this.sessionPlanned || nextCards.length === 0) {
        this.practiceView = 'summary';
      }
    }
  }

  resetDemo() {
    this.reviewState = {};
    this.currentIndex = 0;
    this.showAnswer = false;
    this.#onReset();
    clearReviewState();
  }

  cardPath(card: Card) {
    return `/mandarin/${card.id}`;
  }

  /**
   * Browser Back/Forward only: a bare /mandarin URL returns to the course
   * home. This must never run from loadCorpus/deck-swap paths - a corpus
   * retry finishing mid-practice would otherwise teleport the user home and
   * discard their session.
   */
  onPopstate() {
    const slug = window.location.pathname.match(/^\/mandarin\/([^/]+)/)?.[1];
    if (!slug) {
      // Never yanks the user out of listening practice, which lives on the
      // bare path. Card practice, the summary, and the transient hub views all
      // return home.
      if (['cards', 'summary', 'journey', 'story', 'you'].includes(this.practiceView)) {
        this.practiceView = 'home';
        this.storyChar = null;
      }
      return;
    }
    this.syncCardFromPath();
  }

  syncCardFromPath() {
    const slug = window.location.pathname.match(/^\/mandarin\/([^/]+)/)?.[1];
    if (!slug) return;

    const cardIndex = this.cards.findIndex((card) => card.id === slug);
    if (cardIndex < 0) return;

    // Already practicing exactly this card mid-session (e.g. a corpus reload
    // honoring the current URL): keep the bounded session intact instead of
    // silently flipping the user into unbounded browsing.
    if (this.sessionActive && this.practiceView !== 'home' && this.currentCard?.id === slug) return;

    this.scopeLessons = null;
    this.scopeLabel = '';
    this.mode = 'all';
    // Deep links browse the whole deck unbounded - no batch summary.
    this.sessionActive = false;
    this.sessionRatings = [];
    // Never yank the user out of listening practice: a corpus load resolving
    // while a listening round is open (deep-link slug that only exists in the
    // swapped deck) must not flip the view mid-round. This matches the
    // pre-course-home behavior, where URL sync never changed the view.
    if (this.practiceView !== 'listening') this.practiceView = 'cards';
    this.currentIndex = cardIndex;
    this.showAnswer = false;
    this.#onReset();
  }

  syncPathToCard(card: Card) {
    const path = this.cardPath(card);
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
  }

  async loadCorpus() {
    this.corpusLoading = true;
    let corpus: Awaited<ReturnType<typeof fetchMandarinCorpus>>;
    // Only the fetch/parse/validate steps live in the try: a throw from the
    // deck-swap bookkeeping below must never mislabel a successful load as a
    // failure (the banner would then contradict the header's card count).
    try {
      corpus = await fetchMandarinCorpus();
    } catch (error) {
      // Failure must be visible, never silent: the built-in demo deck keeps
      // practice usable, but the user is told they are not on the full corpus.
      this.corpusLoaded = false;
      this.corpusLoadFailed = true;
      console.warn('Mandarin corpus load failed; using the built-in fallback deck.', error);
      return;
    } finally {
      this.corpusLoading = false;
    }

    const previousCardId = this.currentCard?.id ?? null;
    this.cards = corpus.cards;
    this.corpusCardCount = corpus.cardCount;
    this.corpusLessonCount = corpus.lessonCount;
    this.deckUnits = corpus.units;
    this.corpusLoaded = true;
    this.corpusLoadFailed = false;
    if (this.scopeLessons && !corpus.cards.some((card) => this.scopeLessons!.has(card.lessonId))) {
      // A scope referencing lessons absent from the swapped deck would leave
      // the practicing user staring at an empty queue.
      this.scopeLessons = null;
      this.scopeLabel = '';
    }
    if (previousCardId && !corpus.cards.some((card) => card.id === previousCardId)) {
      // The card being practiced is not in the swapped deck (e.g. a fallback
      // card after a successful retry): reset per-card state so a revealed
      // answer, transcript, or rating from the old card is never applied to
      // an unrelated one.
      this.currentIndex = 0;
      this.showAnswer = false;
      this.#onReset();
    }
    const slug = window.location.pathname.match(/^\/mandarin\/([^/]+)/)?.[1];
    if (slug && !corpus.cards.some((card) => card.id === slug)) {
      window.history.replaceState({}, '', '/mandarin');
    }
    this.syncCardFromPath();
  }
}
