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
  // The WORD drives scheduling; tone does NOT. An automated core-loop audit
  // (scripts/core-loop-audit.mjs, 2026-08-24) confirmed the word check is
  // reliable both ways (10/10 correct recognized, 10/10 wrong rejected) but the
  // server tone contour still scores a *correct* pronunciation "off" ~20% of the
  // time across voices — too high a false-negative rate to let it demote a
  // correct answer. So tone stays rich on-screen guidance (shown, honest,
  // approximate), never a grade. `_tone` is accepted for API stability but
  // intentionally unused. With no trustworthy word signal, the learner rates by
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
