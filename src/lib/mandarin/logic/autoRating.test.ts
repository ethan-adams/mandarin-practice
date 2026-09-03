import { describe, expect, it } from 'vitest';

import { deriveAutoRating, type ToneSchedulingSignal } from './autoRating';
import type { PronunciationResult } from '../../utils/mandarinPronunciation';

const toneMiss = (expectedTone = 3): ToneSchedulingSignal => ({ confidentMiss: true, expectedTone });
const word = (status: PronunciationResult['status'], expected = '好'): PronunciationResult => ({
  status,
  normalized_expected: expected,
  normalized_transcript: status === 'missed' ? '号' : expected,
  similarity: status === 'missed' ? 0.2 : 0.95,
});

describe('deriveAutoRating (word drives pass/fail; a confident tone miss only softens a pass)', () => {
  it('returns null when there is no trustworthy word signal (fallback path)', () => {
    expect(deriveAutoRating(null, null)).toBeNull();
    expect(deriveAutoRating(null, word('no_speech'))).toBeNull();
    // Tone-only attempt: tone alone must never grade the card.
    expect(deriveAutoRating(toneMiss(), null)).toBeNull();
    expect(deriveAutoRating(toneMiss(), word('no_speech'))).toBeNull();
  });

  it('correct when the word matches and there is no confident tone miss', () => {
    expect(deriveAutoRating(null, word('matched'))?.rating).toBe('correct');
  });

  it('a confident tone miss demotes a matched word to "hard" — never fails it', () => {
    const verdict = deriveAutoRating(toneMiss(2), word('matched'))!;
    expect(verdict.rating).toBe('hard');
    expect(verdict.headline).toBe('Right word, tone off');
    // Tone can only ever lower a pass to "hard"; it can never produce "wrong".
    expect(verdict.rating).not.toBe('wrong');
  });

  it('a close-but-not-exact word caps at "hard" regardless of tone', () => {
    const verdict = deriveAutoRating(null, word('close'))!;
    expect(verdict.rating).toBe('hard');
    expect(verdict.headline).toBe('So close');
    expect(deriveAutoRating(toneMiss(), word('close'))?.rating).toBe('hard');
  });

  it('wrong when a multi-syllable answer is heard as a different word (tone never escalates)', () => {
    expect(deriveAutoRating(null, word('missed', '谢谢'))?.rating).toBe('wrong');
    expect(deriveAutoRating(toneMiss(), word('missed', '谢谢'))?.rating).toBe('wrong');
  });

  it('a single-syllable read-back miss never auto-fails; the ear decides', () => {
    expect(deriveAutoRating(toneMiss(), word('missed', '爱'))).toBeNull();
    expect(deriveAutoRating(null, word('missed', '爱'))).toBeNull();
  });
});
