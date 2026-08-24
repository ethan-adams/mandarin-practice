import { describe, it, expect } from 'vitest';
import { buildListeningRound, isRoundCorrect } from './mandarinListening';
import type { Card } from '../mandarin/logic/deck';

const card = (id: string, answerZh: string, pinyin: string, lessonId = 'L', audio = true): Card => ({
  id,
  answerZh,
  pinyin,
  lessonId,
  promptEn: id,
  audioUrl: audio ? `audio/${id}.mp3` : undefined,
});

const pool: Card[] = [
  card('a', '妈', 'mā'),
  card('b', '麻', 'má'),
  card('c', '马', 'mǎ'),
  card('d', '骂', 'mà'),
  card('e', '能', 'néng'),
  card('f', '能', 'néng'), // homophone duplicate: same sound as e
  card('g', '好', 'hǎo'),
  card('h', '你', 'nǐ'),
];

const sound = (id: string) => pool.find((c) => c.id === id)!.pinyin.replace(/\s+/g, '');

describe('buildListeningRound', () => {
  it('offers up to 4 sound-distinct options and always includes the target', () => {
    const round = buildListeningRound(pool, 0)!;
    expect(round).not.toBeNull();
    expect(round.optionIds).toContain(round.targetId);
    expect(round.optionIds.length).toBeGreaterThanOrEqual(2);
    expect(round.optionIds.length).toBeLessThanOrEqual(4);
    const sounds = round.optionIds.map(sound);
    expect(new Set(sounds).size).toBe(sounds.length); // no two options sound alike
  });

  it('never offers two homophones together (the 能/能 case)', () => {
    for (let i = 0; i < 16; i += 1) {
      const round = buildListeningRound(pool, i)!;
      const nengs = round.optionIds.filter((id) => id === 'e' || id === 'f');
      expect(nengs.length).toBeLessThanOrEqual(1);
    }
  });

  it('scores correctness objectively', () => {
    const round = buildListeningRound(pool, 3)!;
    expect(isRoundCorrect({ ...round, selectedId: round.targetId })).toBe(true);
    const wrong = round.optionIds.find((id) => id !== round.targetId)!;
    expect(isRoundCorrect({ ...round, selectedId: wrong })).toBe(false);
  });

  it('returns null when there are not enough cards', () => {
    expect(buildListeningRound([card('x', '好', 'hǎo')], 0)).toBeNull();
  });
});
