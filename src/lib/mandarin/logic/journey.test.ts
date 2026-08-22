import { describe, expect, it } from 'vitest';
import { characterProgress, journeyStats } from './journey';
import type { Card } from './deck';
import { defaultCardState, type CardState } from './srs';

function card(id: string, answerZh: string): Card {
  return { id, lessonId: 'L', promptEn: id, answerZh, pinyin: 'x' };
}

function state(over: Partial<CardState>): CardState {
  return { ...defaultCardState(), ...over };
}

const cards = [card('a', '我想喝茶'), card('b', '我要喝水'), card('c', 'Hello 好')];

describe('characterProgress', () => {
  it('counts every unique Han character and ignores non-Han', () => {
    const chars = characterProgress(cards, {});
    const set = new Set(chars.map((c) => c.char));
    // 我想喝茶 要 水 好 → 我 想 喝 茶 要 水 好 = 7 unique; latin/space dropped.
    expect(chars).toHaveLength(7);
    expect(set.has('好')).toBe(true);
    expect([...set].every((ch) => /\p{Script=Han}/u.test(ch))).toBe(true);
  });

  it('marks a character fresh until a card containing it is attempted', () => {
    const chars = characterProgress(cards, {});
    expect(chars.every((c) => c.status === 'fresh')).toBe(true);
    expect(chars.every((c) => c.seenIn === 0)).toBe(true);
  });

  it('met when any containing card is attempted; sticking only at interval ≥ 7', () => {
    const reviewState = {
      a: state({ attempts: 3, intervalDays: 8 }), // 我 想 喝 茶 → sticking
      b: state({ attempts: 1, intervalDays: 2 }), // 我 要 喝 水 → met
    };
    const by = new Map(characterProgress(cards, reviewState).map((c) => [c.char, c]));
    expect(by.get('茶')!.status).toBe('sticking'); // only in the mastered card
    expect(by.get('要')!.status).toBe('met'); // only in the low-interval card
    // 我/喝 appear in both a (sticking) and b (met): best status wins.
    expect(by.get('我')!.status).toBe('sticking');
    expect(by.get('我')!.seenIn).toBe(2);
    expect(by.get('好')!.status).toBe('fresh'); // card c never attempted
  });
});

describe('journeyStats', () => {
  it('summarises characters and words with the shared mastery bar', () => {
    const reviewState = {
      a: state({ attempts: 3, intervalDays: 8 }),
      b: state({ attempts: 1, intervalDays: 2 }),
    };
    const stats = journeyStats(cards, reviewState);
    expect(stats.charsTotal).toBe(7);
    expect(stats.charsMet).toBe(6); // all but 好
    expect(stats.charsSticking).toBe(4); // 我 想 喝 茶
    expect(stats.wordsTotal).toBe(3);
    expect(stats.wordsMet).toBe(2);
    expect(stats.wordsSticking).toBe(1); // only card a is ≥ 7 days out
  });
});
