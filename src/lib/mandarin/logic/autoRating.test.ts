import { describe, expect, it } from 'vitest';

import { deriveAutoRating } from './autoRating';
import type { ContourComparison } from '../../utils/mandarinToneReference';
import type { PronunciationResult } from '../../utils/mandarinPronunciation';

const tone = (status: ContourComparison['status']): ContourComparison => ({
  similarity: status === 'matched' ? 0.9 : status === 'close' ? 0.6 : 0.2,
  correlation: 0.5,
  status,
});
const word = (status: PronunciationResult['status'], expected = '好'): PronunciationResult => ({
  status,
  normalized_expected: expected,
  normalized_transcript: status === 'missed' ? '号' : expected,
  similarity: status === 'missed' ? 0.2 : 0.95,
});

describe('deriveAutoRating (word drives scheduling; tone is guidance only)', () => {
  it('returns null when there is no trustworthy word signal (fallback path)', () => {
    expect(deriveAutoRating(null, null)).toBeNull();
    expect(deriveAutoRating(null, word('no_speech'))).toBeNull();
    // Tone-only attempt: the unvalidated pitch detector must not grade the card.
    expect(deriveAutoRating(tone('matched'), null)).toBeNull();
    expect(deriveAutoRating(tone('close'), null)).toBeNull();
  });

  it('correct when the word matches — the (untrusted) tone never downgrades it', () => {
    expect(deriveAutoRating(tone('matched'), word('matched'))?.rating).toBe('correct');
    expect(deriveAutoRating(tone('missed'), word('matched'))?.rating).toBe('correct');
    expect(deriveAutoRating(null, word('matched'))?.rating).toBe('correct');
  });

  it('a close-but-not-exact word caps at "hard" and never claims full credit', () => {
    const verdict = deriveAutoRating(tone('matched'), word('close'))!;
    expect(verdict.rating).toBe('hard');
    expect(verdict.headline).toBe('So close');
    expect(verdict.detail.toLowerCase()).toContain('nearly');
  });

  it('wrong when a multi-syllable answer is heard as a different word', () => {
    expect(deriveAutoRating(tone('matched'), word('missed', '谢谢'))?.rating).toBe('wrong');
  });

  it('a single-syllable read-back miss never auto-fails; the ear decides', () => {
    expect(deriveAutoRating(tone('matched'), word('missed', '爱'))).toBeNull();
    expect(deriveAutoRating(null, word('missed', '爱'))).toBeNull();
  });
});
