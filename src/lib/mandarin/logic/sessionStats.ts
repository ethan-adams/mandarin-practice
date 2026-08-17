// Session summary statistics: practice-day streaks and the review outlook.
// All numbers derive from the learner's own ratings and the SRS schedule - // nothing here touches or changes scheduling.

import type { Card } from './deck';
import { isDue, today, type CardState, type Rating } from './srs';

export const PRACTICE_DAYS_KEY = 'mandarin-practice-days-v1';
const MAX_TRACKED_DAYS = 400;

export function loadPracticeDays(): string[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PRACTICE_DAYS_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((day): day is string => typeof day === 'string') : [];
  } catch {
    return [];
  }
}

/** Append a practiced day (idempotent), keeping the list sorted and bounded. */
export function recordPracticeDay(days: string[], day = today()): string[] {
  if (days.includes(day)) return days;
  return [...days, day].sort().slice(-MAX_TRACKED_DAYS);
}

export function savePracticeDays(days: string[]) {
  localStorage.setItem(PRACTICE_DAYS_KEY, JSON.stringify(days));
}

/** Consecutive practiced days ending at `day` (0 when `day` itself is unpracticed). */
export function dayStreak(days: string[], day = today()): number {
  const practiced = new Set(days);
  let streak = 0;
  const cursor = new Date(`${day}T00:00:00Z`);
  while (practiced.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export type SessionTally = {
  done: number;
  correct: number;
  hard: number;
  wrong: number;
  /** 0-100, correct ratings over all ratings; null when nothing rated. */
  accuracyPct: number | null;
};

export function sessionTally(ratings: Rating[]): SessionTally {
  const done = ratings.length;
  const correct = ratings.filter((rating) => rating === 'correct').length;
  const hard = ratings.filter((rating) => rating === 'hard').length;
  const wrong = done - correct - hard;
  return { done, correct, hard, wrong, accuracyPct: done ? Math.round((correct / done) * 100) : null };
}

export type DueOutlook = {
  /** Seen cards whose review is due right now. */
  dueNow: number;
  /** Never-seen cards available to learn. */
  fresh: number;
  /** Earliest upcoming review date after today, and how many land on it. */
  nextDueDate: string | null;
  nextDueCount: number;
};

export function dueOutlook(cards: Card[], reviewState: Record<string, CardState>, day = today()): DueOutlook {
  let dueNow = 0;
  let fresh = 0;
  let nextDueDate: string | null = null;
  let nextDueCount = 0;
  for (const card of cards) {
    const state = reviewState[card.id];
    if (!state || (state.attempts ?? 0) === 0) {
      fresh += 1;
      continue;
    }
    if (isDue(state)) {
      dueNow += 1;
      continue;
    }
    const dueDate = state.due;
    if (!dueDate || dueDate <= day) continue;
    if (nextDueDate === null || dueDate < nextDueDate) {
      nextDueDate = dueDate;
      nextDueCount = 1;
    } else if (dueDate === nextDueDate) {
      nextDueCount += 1;
    }
  }
  return { dueNow, fresh, nextDueDate, nextDueCount };
}
