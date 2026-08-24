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
  _tone: ContourComparison | null,
  word: (PronunciationResult & { transcript?: string }) | null,
): AutoVerdict | null {
  // Scheduling is driven by the WORD, not the tone. The in-browser tone detector
  // is unvalidated — it octave-errors and reads most tones as falling — so letting
  // it move the review calendar corrupted scheduling while the UI hedged it as
  // "not a grade". Tone stays on-screen guidance only until it is validated
  // (planned server-side). With no trustworthy word signal, the learner rates by
  // ear via the manual fallback.
  const wordSpoke = !!word && word.status !== 'no_speech';
  if (!wordSpoke) return null;

  if (word!.status === 'matched') {
    return { rating: 'correct', headline: 'Right word', detail: 'That matched. Keep an ear on the tone above.' };
  }
  if (word!.status === 'close') {
    return { rating: 'hard', headline: 'So close', detail: 'Nearly the right word.' };
  }

  // status === 'missed'
  const expectedUnits = [...(word!.normalized_expected ?? '')].filter((ch) => /\p{Script=Han}/u.test(ch)).length;
  if (expectedUnits >= 2) {
    // Several syllables heard as a different word: the clearest "again".
    return { rating: 'wrong', headline: 'Not quite', detail: 'That sounded like a different word. Give it another go.' };
  }
  // A single-syllable read-back miss is unreliable (recognizers trip on lone
  // syllables), so never fail the card on it — let the learner rate by ear.
  return null;
}
