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

  // A read-back miss on a single-syllable answer is not trustworthy: recognizers
  // routinely return a homophone or the wrong character for one lone syllable, so
  // we must not fail the card on it. Defer to tone, or to the manual fallback.
  let wordMissLowTrust = false;

  // When word check ran, it's the strongest signal — resolve it before tone.
  if (wordSpoke) {
    if (word!.status === 'missed') {
      const expectedUnits = [...(word!.normalized_expected ?? '')].filter((ch) => /\p{Script=Han}/u.test(ch)).length;
      if (expectedUnits >= 2) {
        // Multiple syllables heard as a different word: the clearest "again".
        return {
          rating: 'wrong',
          headline: 'Not quite',
          detail: 'That sounded like a different word — give it another go.',
        };
      }
      wordMissLowTrust = true;
    } else if (word!.status === 'close') {
      // Nearly the right word (extra/missing syllable, or a near-homophone): never
      // full credit, and never claim "right word" — say honestly it was close.
      const toneNote = tone?.status === 'matched' ? 'your tone was on, though' : 'and keep working the tone';
      return {
        rating: 'hard',
        headline: 'So close',
        detail: `Nearly the right word — ${toneNote}.`,
      };
    }
    // word matched → fall through and let the tone shape decide the polish.
  }

  // If the only signal was an untrustworthy single-syllable word miss, don't
  // guess a schedule — let the learner rate it by ear.
  if (wordMissLowTrust && !toneSpoke) return null;

  // Right word (or tone-only attempt): let the tone shape decide the polish.
  const toneStatus: ContourComparison['status'] = tone?.status ?? 'matched';
  if (toneStatus === 'matched') {
    if (wordMissLowTrust) {
      return {
        rating: 'hard',
        headline: 'Check the word',
        detail: 'Your tone matched, but the read-back was unsure — hear it and compare.',
      };
    }
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
      detail: wordMissLowTrust ? 'Tone was close; hear it and check the word.' : wordSpoke ? 'Right word — the tone was close.' : 'Close on the tone shape.',
    };
  }
  // tone missed
  return {
    rating: 'hard',
    headline: 'Keep working it',
    detail: wordMissLowTrust ? 'Hear it and try again.' : wordSpoke ? 'Right word — watch the tone shape.' : 'The tone drifted from the native shape.',
  };
}
