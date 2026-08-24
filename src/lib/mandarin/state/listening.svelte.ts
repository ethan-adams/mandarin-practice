// Listening practice state, backed by the real deck and its native audio. A
// round plays one card's clip and asks which word you heard. Correctness is
// objective (you picked the card that was played), so there is no self-rating.
import { buildListeningRound, isRoundCorrect, type ListeningRound } from '../../utils/mandarinListening';
import type { Card } from '../logic/deck';
import { listeningCountStorageKey, listeningStorageKey } from './storageKeys';

export class ListeningStore {
  pool = $state<Card[]>([]);
  index = $state(0);
  round = $state<ListeningRound | null>(null);
  completed = $state(0);
  correct = $state(0);

  target = $derived(this.round ? (this.pool.find((card) => card.id === this.round!.targetId) ?? null) : null);
  options = $derived(
    this.round
      ? (this.round.optionIds.map((id) => this.pool.find((card) => card.id === id)).filter(Boolean) as Card[])
      : [],
  );
  revealed = $derived(Boolean(this.round?.selectedId));
  correctAnswer = $derived(isRoundCorrect(this.round ?? { targetId: '', optionIds: [], selectedId: null, audioUnavailable: false }));

  load() {
    const storedCompleted = Number(localStorage.getItem(listeningCountStorageKey));
    const storedCorrect = Number(localStorage.getItem(listeningStorageKey));
    this.completed = Number.isSafeInteger(storedCompleted) && storedCompleted >= 0 ? storedCompleted : 0;
    this.correct = Number.isSafeInteger(storedCorrect) && storedCorrect >= 0 ? storedCorrect : 0;
  }

  /** Point the drill at a set of cards. Keeps the current round if one is live,
   *  so a deck swap (corpus load) doesn't yank the question away mid-answer. */
  setPool(cards: Card[]) {
    this.pool = cards;
    if (!this.round) this.round = buildListeningRound(cards, this.index);
  }

  choose(id: string) {
    if (!this.round || this.round.selectedId) return;
    const correct = id === this.round.targetId;
    this.round = { ...this.round, selectedId: id };
    this.completed += 1;
    if (correct) this.correct += 1;
    localStorage.setItem(listeningCountStorageKey, String(this.completed));
    localStorage.setItem(listeningStorageKey, String(this.correct));
  }

  next() {
    this.index += 1;
    this.round = buildListeningRound(this.pool, this.index);
  }

  markAudioUnavailable() {
    if (this.round) this.round = { ...this.round, audioUnavailable: true };
  }
}
