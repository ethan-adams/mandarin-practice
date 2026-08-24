import { describe, it, expect, vi } from 'vitest';

// The real corpus that loadCorpus will swap in. Its ids differ from the fallback
// deck, so a swap would rehome the current card and fire onReset.
const corpus = {
  cards: [{ id: 'real-1', lessonId: 'L1', promptEn: 'good', answerZh: '好', pinyin: 'hǎo' }],
  cardCount: 1,
  lessonCount: 1,
  units: null,
};

vi.mock('../src/lib/mandarin/logic/deck', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/mandarin/logic/deck')>();
  return { ...actual, fetchMandarinCorpus: vi.fn(async () => corpus) };
});

import { PracticeSession } from '../src/lib/mandarin/state/session.svelte';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('loadCorpus defers the deck swap while a capture is active', () => {
  it('leaves the deck (and the live attempt) alone until the mic is idle', async () => {
    let busy = true;
    const onReset = vi.fn();
    const session = new PracticeSession(onReset, () => busy);
    // A current card that is NOT in the incoming corpus, so a swap would rehome
    // the learner and reset the tone coach mid-recording.
    session.mode = 'all';
    session.cards = [{ id: 'fallback-1', lessonId: 'L0', promptEn: 'love', answerZh: '爱', pinyin: 'ài' }];
    session.currentIndex = 0;
    expect(session.currentCard?.id).toBe('fallback-1');

    const done = session.loadCorpus();
    await tick(60);

    // Still recording: the deck must be untouched and no reset fired.
    expect(session.cards[0]?.id).toBe('fallback-1');
    expect(onReset).not.toHaveBeenCalled();

    // Mic goes idle: the swap is allowed to proceed.
    busy = false;
    await done;

    expect(session.cards[0]?.id).toBe('real-1');
    expect(onReset).toHaveBeenCalled();
  });
});
