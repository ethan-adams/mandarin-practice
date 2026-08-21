// The app judges you instead of asking Again/Good/Easy (Ethan, 2026-08-20).
// When you speak, the tone-contour match + word recognition decide the schedule;
// the result maps onto the existing SRS Rating so nothing downstream changes.
// When there's no speech signal, this returns null and the caller falls back to a
// quiet "knew it / show me again".

import type { ContourComparison } from '../../utils/mandarinToneReference';
import type { PronunciationResult } from '../../utils/mandarinPronunciation';
import type { Rating } from './srs';

export type AutoVerdict = {
  rating: Rating;
  headline: string;
  detail: string;
};

export function deriveAutoRating(
  tone: ContourComparison | null,
  word: (PronunciationResult & { transcript?: string }) | null,
): AutoVerdict | null {
  const wordSpoke = !!word && word.status !== 'no_speech';
  const toneSpoke = !!tone;
  if (!wordSpoke && !toneSpoke) return null; // no attempt — caller shows the fallback

  // Said a different word: the clearest "again".
  if (wordSpoke && word!.status === 'missed') {
    return {
      rating: 'wrong',
      headline: 'Not quite',
      detail: 'That sounded like a different word — give it another go.',
    };
  }

  // Right word (or tone-only attempt): let the tone shape decide the polish.
  const toneStatus: ContourComparison['status'] = tone?.status ?? 'matched';
  if (toneStatus === 'matched') {
    return {
      rating: 'correct',
      headline: 'Well said',
      detail: wordSpoke ? 'Word and tone both landed.' : 'Your tone matched the native shape.',
    };
  }
  if (toneStatus === 'close') {
    return {
      rating: 'hard',
      headline: 'Almost there',
      detail: wordSpoke ? 'Right word — the tone was close.' : 'Close on the tone shape.',
    };
  }
  // tone missed
  return {
    rating: 'hard',
    headline: 'Keep working it',
    detail: wordSpoke ? 'Right word — watch the tone shape.' : 'The tone drifted from the native shape.',
  };
}
