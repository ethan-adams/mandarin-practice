// Split a Mandarin answer into the individual Han characters worth tracing, in
// reading order. Punctuation, spaces, latin letters and digits are dropped;
// repeated characters are kept (you trace each occurrence). Stroke data for
// every character here is self-hosted under /hanzi (see scripts/build-hanzi.mjs).

const HAN = /\p{Script=Han}/u;

export function charactersToPractice(word: string): string[] {
  const out: string[] = [];
  for (const ch of word ?? '') {
    if (HAN.test(ch)) out.push(ch);
  }
  return out;
}

/** Path to a character's self-hosted stroke data. */
export function hanziDataPath(char: string): string {
  return `/hanzi/${encodeURIComponent(char)}.json`;
}
