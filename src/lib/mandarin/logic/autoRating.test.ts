import { describe, expect, it } from 'vitest';

import { deriveAutoRating } from './autoRating';
import type { ContourComparison } from '../../utils/mandarinToneReference';
import type { PronunciationResult } from '../../utils/mandarinPronunciation';

const tone = (status: ContourComparison['status']): ContourComparison => ({
  similarity: status === 'matched' ? 0.9 : status === 'close' ? 0.6 : 0.2,
  correlation: 0.5,
  status,
});
const word = (status: PronunciationResult['status']): PronunciationResult => ({
  status,
  normalized_expected: '好',
  normalized_transcript: status === 'missed' ? '号' : '好',
  similarity: status === 'missed' ? 0.2 : 0.95,
});

describe('deriveAutoRating', () => {
  it('returns null when there was no attempt (fallback path)', () => {
    expect(deriveAutoRating(null, null)).toBeNull();
    expect(deriveAutoRating(null, word('no_speech'))).toBeNull();
  });

  it('wrong when the recognized word is different', () => {
    expect(deriveAutoRating(tone('matched'), word('missed'))?.rating).toBe('wrong');
  });

  it('correct when word matches and tone matches', () => {
    expect(deriveAutoRating(tone('matched'), word('matched'))?.rating).toBe('correct');
  });

  it('hard when the word is right but the tone is close or missed', () => {
    expect(deriveAutoRating(tone('close'), word('matched'))?.rating).toBe('hard');
    expect(deriveAutoRating(tone('missed'), word('matched'))?.rating).toBe('hard');
  });

  it('a close-but-not-exact word never counts as fully correct', () => {
    // Good tone must not let a close word claim full credit — honest feedback.
    const verdict = deriveAutoRating(tone('matched'), word('close'))!;
    expect(verdict.rating).toBe('hard');
    expect(verdict.headline).toBe('So close');
    expect(verdict.detail.toLowerCase()).toContain('nearly');
    expect(verdict.detail.toLowerCase()).not.toContain('both landed');
    // Still capped at 'hard' when the tone is off too.
    expect(deriveAutoRating(tone('missed'), word('close'))?.rating).toBe('hard');
  });

  it('tone-only attempt (no word check) is judged by the contour', () => {
    expect(deriveAutoRating(tone('matched'), null)?.rating).toBe('correct');
    expect(deriveAutoRating(tone('close'), null)?.rating).toBe('hard');
  });
});
