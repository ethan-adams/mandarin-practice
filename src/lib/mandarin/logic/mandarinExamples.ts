// Per-word example sentences: real native Tatoeba sentences with English
// translations (CC BY 2.0), built offline into public/mandarin-examples.json by
// scripts/build-examples.mjs. This module holds the pure, testable pieces; the
// reactive loader lives in mandarinExamples.svelte.ts.

export type Example = { zh: string; en: string };

export type ExamplesPayload = {
  attribution?: string;
  examples: Record<string, Example[]>;
};

/** Split a sentence around each occurrence of `word`, so the UI can highlight
 *  the target word inside the example. Segments are contiguous and in order. */
export function splitAroundWord(zh: string, word: string): { text: string; hit: boolean }[] {
  if (!word || !zh.includes(word)) return [{ text: zh, hit: false }];
  const parts: { text: string; hit: boolean }[] = [];
  let i = 0;
  while (i < zh.length) {
    const idx = zh.indexOf(word, i);
    if (idx < 0) {
      parts.push({ text: zh.slice(i), hit: false });
      break;
    }
    if (idx > i) parts.push({ text: zh.slice(i, idx), hit: false });
    parts.push({ text: word, hit: true });
    i = idx + word.length;
  }
  return parts;
}
