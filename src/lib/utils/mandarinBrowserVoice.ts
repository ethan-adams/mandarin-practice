// speechSynthesis is the last playback tier, and it only counts as available
// when the browser actually has a Mandarin voice installed — speaking a zh-CN
// utterance without one is a silent no-op on most Windows/Linux browsers.

export type SpeechSynthesisVoiceLike = {
  lang: string;
  name: string;
  default?: boolean;
};

export type SpeechSynthesisSourceLike<T extends SpeechSynthesisVoiceLike = SpeechSynthesisVoiceLike> = {
  getVoices: () => T[];
  addEventListener?: (type: 'voiceschanged', listener: () => void) => void;
  removeEventListener?: (type: 'voiceschanged', listener: () => void) => void;
};

const MANDARIN_LANG = /^(zh|cmn)([-_]|$)/iu;
const MAINLAND_HINT = /(^|[-_])(cn|hans)([-_]|$)/iu;

export function pickMandarinVoice<T extends SpeechSynthesisVoiceLike>(voices: readonly T[]): T | null {
  const mandarin = voices.filter((voice) => MANDARIN_LANG.test(voice.lang.trim()));
  if (!mandarin.length) return null;
  const score = (voice: T) => (MAINLAND_HINT.test(voice.lang) ? 2 : 0) + (voice.default ? 1 : 0);
  return mandarin.reduce((best, voice) => (score(voice) > score(best) ? voice : best));
}

// Chrome populates getVoices() asynchronously, so an empty list may just mean
// "not loaded yet" — wait for voiceschanged before concluding no voice exists.
export function findMandarinVoice<T extends SpeechSynthesisVoiceLike>(
  synth: SpeechSynthesisSourceLike<T>,
  timeoutMs = 1500,
): Promise<T | null> {
  const immediate = pickMandarinVoice(synth.getVoices());
  if (immediate || !synth.addEventListener) return Promise.resolve(immediate);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      synth.removeEventListener?.('voiceschanged', onVoicesChanged);
      resolve(value);
    };
    const onVoicesChanged = () => {
      const found = pickMandarinVoice(synth.getVoices());
      if (found) finish(found);
    };
    const timer = setTimeout(() => finish(pickMandarinVoice(synth.getVoices())), timeoutMs);
    synth.addEventListener?.('voiceschanged', onVoicesChanged);
  });
}
