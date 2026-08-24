// Compare what the learner said by SOUND (pinyin), not by hanzi orthography.
// Mandarin is heavily homophonous, so a correct pronunciation that the recognizer
// transcribes as a homophone (他/她, 在/再, 是/事) must still count as right in a
// pronunciation app. We look up each transcribed character's reading in the
// self-hosted hanzi dictionary (public/hanzi-dict.json) and compare toneless
// syllables. Tones are deliberately ignored here — tone is judged separately by
// the tone coach; this only answers "did they say the right sounds?".
import type { PronunciationResult } from './mandarinPronunciation';

const DICT_URL = '/hanzi-dict.json';
let charToSyllable: Map<string, string> | null = null;
let loading: Promise<void> | null = null;

/** Reduce one pinyin reading to a bare, toneless syllable: "hǎo" -> "hao",
 *  "lüè" -> "lüe". Returns null for anything that isn't a syllable. */
export function tonelessSyllable(pinyin: string | null | undefined): string | null {
  if (!pinyin) return null;
  const syllable = pinyin
    .trim()
    .toLowerCase()
    .split(/[\s/,;]+/)[0] // dict readings are single-syllable; take the first reading of a polyphone
    .replaceAll('u:', 'ü')
    .replaceAll('v', 'ü')
    .normalize('NFD')
    // Strip only the four pinyin tone marks (macron/acute/caron/grave); keep the
    // diaeresis so ü stays distinct from u (lǚ vs lù), then recompose.
    .replace(/[̀́̄̌]/g, '')
    .normalize('NFC')
    .replace(/[0-9]/g, '')
    .replace(/[^a-zü]/g, '');
  return syllable || null;
}

/** Toneless syllables of a full pinyin string: "wǒ xiǎng" -> ["wo","xiang"]. */
export function tonelessSyllables(pinyin: string): string[] {
  return pinyin
    .trim()
    .split(/\s+/)
    .map(tonelessSyllable)
    .filter((s): s is string => Boolean(s));
}

/** Lazily load the character->reading map. Best-effort: on failure, sound
 *  comparison is skipped and the character comparison stands. */
export function ensurePinyinLookup(): Promise<void> {
  if (charToSyllable) return Promise.resolve();
  if (!loading) {
    loading = fetch(DICT_URL)
      .then((response) => (response.ok ? response.json() : {}))
      .then((dict: Record<string, { pinyin?: string }>) => {
        const map = new Map<string, string>();
        for (const [char, entry] of Object.entries(dict)) {
          const syllable = tonelessSyllable(entry?.pinyin);
          if (syllable) map.set(char, syllable);
        }
        charToSyllable = map;
      })
      .catch(() => {
        charToSyllable = new Map();
      });
  }
  return loading;
}

export function pinyinLookupReady(): boolean {
  return charToSyllable !== null && charToSyllable.size > 0;
}

/** Toneless syllables for a hanzi transcript via the loaded dict. Returns null
 *  (not []) when the dict isn't ready, so callers can fall back to characters. */
function transcriptSyllables(transcript: string): string[] | null {
  if (!charToSyllable) return null;
  const out: string[] = [];
  for (const char of transcript) {
    if (!/\p{Script=Han}/u.test(char)) continue;
    const syllable = charToSyllable.get(char);
    if (syllable) out.push(syllable);
  }
  return out;
}

/** Compare the expected pinyin against a hanzi transcript by sound. Returns null
 *  when the lookup isn't ready or can't map the transcript, so the caller keeps
 *  its character-based result. */
export function compareBySound(expectedPinyin: string, transcriptHanzi: string): PronunciationResult | null {
  if (!pinyinLookupReady()) return null;
  const expected = tonelessSyllables(expectedPinyin);
  const heard = transcriptSyllables(transcriptHanzi);
  if (!expected.length || heard === null || !heard.length) return null;

  const expectedStr = expected.join(' ');
  const heardStr = heard.join(' ');
  if (expectedStr === heardStr) {
    return { status: 'matched', normalized_expected: expectedStr, normalized_transcript: heardStr, similarity: 1 };
  }

  const heardSet = new Set(heard);
  const overlap = expected.filter((syllable) => heardSet.has(syllable)).length / expected.length;
  const contained = heardStr.includes(expectedStr) || expectedStr.includes(heardStr);
  return {
    status: contained || overlap >= 0.6 ? 'close' : 'missed',
    normalized_expected: expectedStr,
    normalized_transcript: heardStr,
    similarity: Number(overlap.toFixed(3)),
  };
}

const RANK: Record<PronunciationResult['status'], number> = { matched: 3, close: 2, missed: 1, no_speech: 0 };

/**
 * Merge a character-based result with a sound-based one, keeping whichever is
 * stronger. `soundMatch` is true when sound is what earned the (upgraded) status
 * — i.e. the learner said the right sounds but the recognizer picked a homophone,
 * so the UI can say "sounds right" instead of "that is the word".
 */
export function bestSpokenResult(
  charResult: PronunciationResult,
  soundResult: PronunciationResult | null,
): { result: PronunciationResult; soundMatch: boolean } {
  if (!soundResult) return { result: charResult, soundMatch: false };
  if (RANK[soundResult.status] > RANK[charResult.status]) return { result: soundResult, soundMatch: true };
  return { result: charResult, soundMatch: false };
}
