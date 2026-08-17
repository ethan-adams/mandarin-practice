import { describe, expect, it } from 'vitest';
import { dayStreak, dueOutlook, recordPracticeDay, sessionTally } from './sessionStats';
import { addDays, defaultCardState, type CardState } from './srs';
import type { Card } from './deck';

const card = (id: string): Card => ({
  id,
  lessonId: 'L',
  promptEn: `p ${id}`,
  answerZh: '好。',
  pinyin: 'hao3.',
  speechPhonemes: 'hao3.',
});

const state = (overrides: Partial<CardState>): CardState => ({ ...defaultCardState(), ...overrides });

describe('recordPracticeDay', () => {
  it('appends new days once and keeps order', () => {
    const days = recordPracticeDay(['2026-07-14'], '2026-07-15');
    expect(days).toEqual(['2026-07-14', '2026-07-15']);
    expect(recordPracticeDay(days, '2026-07-15')).toBe(days);
  });
});

describe('dayStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(dayStreak(['2026-07-13', '2026-07-14', '2026-07-15'], '2026-07-15')).toBe(3);
  });

  it('breaks on a gap', () => {
    expect(dayStreak(['2026-07-12', '2026-07-14', '2026-07-15'], '2026-07-15')).toBe(2);
  });

  it('is zero when today is unpracticed', () => {
    expect(dayStreak(['2026-07-14'], '2026-07-15')).toBe(0);
    expect(dayStreak([], '2026-07-15')).toBe(0);
  });

  it('crosses month boundaries', () => {
    expect(dayStreak(['2026-06-30', '2026-07-01'], '2026-07-01')).toBe(2);
  });
});

describe('sessionTally', () => {
  it('computes counts and rounded accuracy', () => {
    const tally = sessionTally(['correct', 'correct', 'hard', 'wrong', 'correct']);
    expect(tally).toEqual({ done: 5, correct: 3, hard: 1, wrong: 1, accuracyPct: 60 });
  });

  it('reports null accuracy for an empty session', () => {
    expect(sessionTally([]).accuracyPct).toBeNull();
  });
});

describe('dueOutlook', () => {
  it('splits due-now, fresh, and the earliest upcoming review date', () => {
    const cards = [card('a'), card('b'), card('c'), card('d'), card('e')];
    const reviewState = {
      a: state({ attempts: 1, due: addDays(0) }), // due now
      b: state({ attempts: 2, due: addDays(2) }),
      c: state({ attempts: 2, due: addDays(2) }),
      d: state({ attempts: 2, due: addDays(5) }),
      // e never seen -> fresh
    };
    const outlook = dueOutlook(cards, reviewState);
    expect(outlook.dueNow).toBe(1);
    expect(outlook.fresh).toBe(1);
    expect(outlook.nextDueDate).toBe(addDays(2));
    expect(outlook.nextDueCount).toBe(2);
  });

  it('reports no upcoming date when nothing is scheduled ahead', () => {
    const outlook = dueOutlook([card('a')], { a: state({ attempts: 1, due: addDays(0) }) });
    expect(outlook.nextDueDate).toBeNull();
  });
});
