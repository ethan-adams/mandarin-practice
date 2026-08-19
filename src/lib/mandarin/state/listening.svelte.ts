// Listening-discrimination practice state. Confidence ratings are stored
// locally and stay separate from card scheduling.

import {
  appendListeningResult,
  completeListeningRound,
  createListeningRound,
  listeningCue,
  listeningPair,
  markListeningAudioUnavailable,
  revealListeningAnswer,
  selectListeningAnswer,
  type ListeningConfidence,
  type ListeningResult,
  type ListeningRound,
} from '../../utils/mandarinContrastPractice';

import { listeningCountStorageKey, listeningStorageKey } from './storageKeys';
const listeningSeed = 'mandarin-listening-v1';

export class ListeningStore {
  results = $state<ListeningResult[]>([]);
  completedCount = $state(0);
  round = $state<ListeningRound>(createListeningRound(listeningSeed, 0));

  currentPair = $derived(listeningPair(this.round));
  currentCue = $derived(listeningCue(this.round));

  load() {
    try {
      const stored = JSON.parse(localStorage.getItem(listeningStorageKey) ?? '[]');
      this.results = Array.isArray(stored) ? stored : [];
    } catch {
      this.results = [];
    }
    const storedCount = Number(localStorage.getItem(listeningCountStorageKey));
    this.completedCount =
      Number.isSafeInteger(storedCount) && storedCount >= this.results.length ? storedCount : this.results.length;
    this.round = createListeningRound(listeningSeed, this.completedCount);
  }

  choose(cueId: string) {
    this.round = selectListeningAnswer(this.round, cueId);
  }

  reveal() {
    this.round = revealListeningAnswer(this.round);
  }

  rateConfidence(confidence: ListeningConfidence) {
    const completion = completeListeningRound(this.round, confidence, new Date().toISOString());
    if (!completion.result) return;
    const history = appendListeningResult(this.results, this.completedCount, completion.result);
    this.results = history.results;
    this.completedCount = history.totalCompleted;
    localStorage.setItem(listeningStorageKey, JSON.stringify(this.results));
    localStorage.setItem(listeningCountStorageKey, String(this.completedCount));
    this.round = createListeningRound(listeningSeed, this.completedCount);
  }

  markAudioUnavailable() {
    this.round = markListeningAudioUnavailable(this.round);
  }
}
