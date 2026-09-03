// The app judges you instead of asking Again/Good/Easy (Ethan, 2026-08-20).
// When you speak, word recognition drives the schedule; tone can DEMOTE a correct
// word to "hard" (never fail it) on a single-syllable card the trained model
// confidently marks a tone miss. The result maps onto the existing SRS Rating so
// nothing downstream changes. With no speech signal this returns null and the
// caller falls back to a quiet "knew it / show me again".

import type { PronunciationResult } from '../../utils/mandarinPronunciation';
import type { Rating } from './srs';

export type AutoVerdict = {
  rating: Rating;
  headline: string;
  detail: string;
};

/** The confidence a trained-model tone miss needs before it may demote the SRS.
 *  eval/scorecards/tone_confidence.json: at 0.90 a correct pronunciation is
 *  wrongly demoted only 1.9% of the time overall (T3 5%), never failed. */
export const TONE_DEMOTE_CONFIDENCE = 0.9;

/** The only tone signal allowed to touch scheduling: a confident model miss on a
 *  single graded syllable (built in toneCoach from the server model's verdict).
 *  It can lower a correct word to "hard"; it can never fail a card. */
export type ToneSchedulingSignal = { confidentMiss: boolean; expectedTone: number };

export function deriveAutoRating(
  tone: ToneSchedulingSignal | null,
  word: (PronunciationResult & { transcript?: string }) | null,
): AutoVerdict | null {
  // The WORD decides pass/fail; TONE may only soften a pass. A single-syllable
  // card is where this matters: Phase C measured whisper recovering a lone
  // syllable's sound just 40.9% of the time, so the word check alone can't grade
  // it — the trained tone model (91.8% cross-voice), gated at a confidence where
  // it wrongly demotes a correct take <2% of the time, is the honest signal
  // there. It NEVER fails a card and NEVER touches multi-syllable scheduling
  // (per-syllable segmentation on connected speech is unmeasured). With no
  // trustworthy word signal, the learner rates by ear via the manual fallback.
  const wordSpoke = !!word && word.status !== 'no_speech';
  if (!wordSpoke) return null;

  if (word!.status === 'matched') {
    if (tone?.confidentMiss) {
      return {
        rating: 'hard',
        headline: 'Right word, tone off',
        detail: 'You said the right word, but the tone missed. Hear it and match the shape.',
      };
    }
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
  // syllables — Phase C: 40.9%), so never fail the card on it — let the learner
  // rate by ear.
  return null;
}
