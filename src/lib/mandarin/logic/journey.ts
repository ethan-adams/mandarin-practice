// Character-level progress for the Journey screen. Honest by construction: a
// character is "met" only when it appears in a card the learner has actually
// rated, and "sticking" only when it appears in a card the scheduler has pushed
// a week or more out (the same mastery bar unitProgress uses for words). No
// due-date pressure is surfaced here — Journey is a map of ground covered, not a
// review queue. Progress is derived from real ratings, never automatic scoring.

import type { Card } from './deck';
import type { CardState } from './srs';
import { unitProgress } from './course';

const HAN = /\p{Script=Han}/u;

/** A character is sticking (mastered in ≥1 card), met (attempted), or fresh. */
export type CharStatus = 'sticking' | 'met' | 'fresh';

export type CharEntry = {
  char: string;
  status: CharStatus;
  /** How many attempted cards this character appears in. */
  seenIn: number;
  /** How many deck cards contain it at all (met + fresh). */
  totalIn: number;
};

export type JourneyStats = {
  charsTotal: number;
  charsMet: number;
  charsSticking: number;
  /** Words = cards; reuses the same seen/mastered bar as the course view. */
  wordsTotal: number;
  wordsMet: number;
  wordsSticking: number;
};

type CharAcc = { seenIn: number; totalIn: number; met: boolean; sticking: boolean };

/**
 * One entry per unique Han character in the deck, in first-appearance order so
 * the Journey grid reads roughly by lesson progression rather than by codepoint.
 */
export function characterProgress(cards: Card[], reviewState: Record<string, CardState>): CharEntry[] {
  const map = new Map<string, CharAcc>();
  for (const card of cards) {
    const state = reviewState[card.id];
    const attempts = state?.attempts ?? 0;
    const met = attempts > 0;
    // Same mastery definition as unitProgress: a card scheduled a week or more
    // out has survived repeated correct ratings.
    const sticking = met && (state?.intervalDays ?? 0) >= 7;

    // Count each character once per card, even if it repeats within the answer.
    const seen = new Set<string>();
    for (const ch of card.answerZh ?? '') if (HAN.test(ch)) seen.add(ch);
    for (const ch of seen) {
      const acc = map.get(ch) ?? { seenIn: 0, totalIn: 0, met: false, sticking: false };
      acc.totalIn += 1;
      if (met) acc.seenIn += 1;
      acc.met ||= met;
      acc.sticking ||= sticking;
      map.set(ch, acc);
    }
  }

  return [...map.entries()].map(([char, acc]) => ({
    char,
    status: acc.sticking ? 'sticking' : acc.met ? 'met' : 'fresh',
    seenIn: acc.seenIn,
    totalIn: acc.totalIn,
  }));
}

export function journeyStats(cards: Card[], reviewState: Record<string, CardState>): JourneyStats {
  const chars = characterProgress(cards, reviewState);
  const words = unitProgress(cards, reviewState);
  return {
    charsTotal: chars.length,
    charsMet: chars.filter((c) => c.status !== 'fresh').length,
    charsSticking: chars.filter((c) => c.status === 'sticking').length,
    wordsTotal: words.total,
    wordsMet: words.seen,
    wordsSticking: words.mastered,
  };
}
