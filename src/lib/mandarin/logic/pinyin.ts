// Pinyin parsing helpers for the Mandarin learning core: numbered-syllable to
// tone-mark conversion, per-syllable tone extraction, and character/pinyin
// alignment for the tone coach tiles. Pure functions, no DOM.

export type PinyinPart = {
  text: string;
  tone: number | null;
  syllable: boolean;
};

export type CharacterUnit = {
  text: string;
  pinyin: string;
  tone: number | null;
  unitIndex: number;
  toneIndex: number | null;
};

const vowels = ['a', 'e', 'i', 'o', 'u', 'ü'];

const toneMap: Record<string, { plain: string; tone: number }> = {
  ā: { plain: 'a', tone: 1 },
  á: { plain: 'a', tone: 2 },
  ǎ: { plain: 'a', tone: 3 },
  à: { plain: 'a', tone: 4 },
  ē: { plain: 'e', tone: 1 },
  é: { plain: 'e', tone: 2 },
  ě: { plain: 'e', tone: 3 },
  è: { plain: 'e', tone: 4 },
  ī: { plain: 'i', tone: 1 },
  í: { plain: 'i', tone: 2 },
  ǐ: { plain: 'i', tone: 3 },
  ì: { plain: 'i', tone: 4 },
  ō: { plain: 'o', tone: 1 },
  ó: { plain: 'o', tone: 2 },
  ǒ: { plain: 'o', tone: 3 },
  ò: { plain: 'o', tone: 4 },
  ū: { plain: 'u', tone: 1 },
  ú: { plain: 'u', tone: 2 },
  ǔ: { plain: 'u', tone: 3 },
  ù: { plain: 'u', tone: 4 },
  ǖ: { plain: 'ü', tone: 1 },
  ǘ: { plain: 'ü', tone: 2 },
  ǚ: { plain: 'ü', tone: 3 },
  ǜ: { plain: 'ü', tone: 4 },
};

const toneMarks: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

export function pinyinText(value: string) {
  return value.replace(/[A-Za-züÜvV:]+[1-5]/g, (syllable) => convertNumberedSyllable(syllable));
}

function convertNumberedSyllable(syllable: string) {
  const tone = Number(syllable.at(-1));
  let base = syllable.slice(0, -1).replaceAll('u:', 'ü').replaceAll('U:', 'Ü').replaceAll('v', 'ü').replaceAll('V', 'Ü');
  if (tone === 5) return base;

  const lower = base.toLowerCase();
  let index = lower.indexOf('a');
  if (index < 0) index = lower.indexOf('e');
  if (index < 0) index = lower.indexOf('ou');
  if (index < 0) {
    for (let i = base.length - 1; i >= 0; i -= 1) {
      if (vowels.includes(lower[i])) {
        index = i;
        break;
      }
    }
  }
  if (index < 0) return base;

  const source = base[index];
  const marked = toneMarks[source.toLowerCase()]?.[tone - 1] ?? source;
  const finalMark = source === source.toUpperCase() ? marked.toUpperCase() : marked;
  return `${base.slice(0, index)}${finalMark}${base.slice(index + 1)}`;
}

export function pinyinParts(value: string): PinyinPart[] {
  return pinyinText(value)
    .split(/(\s+)/)
    .filter(Boolean)
    .map((text) => {
      const tone = [...text.toLowerCase()].find((char) => toneMap[char])?.toLowerCase();
      return {
        text,
        tone: tone ? toneMap[tone].tone : null,
        syllable: /[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/i.test(text),
      };
    });
}

export function answerTokens(value: string) {
  return value.match(/[A-Za-z]+|[\p{Script=Han}]|[0-9]+/gu) ?? [];
}

/**
 * Pinyin as shown on a single tone tile: sentence punctuation carried by the
 * raw token (e.g. "diào.") must not render inside the tile.
 */
export function displayPinyinSyllable(value: string) {
  return value.replace(/[^\p{L}\p{M}\p{N}]+$/gu, '').replace(/^[^\p{L}\p{M}\p{N}]+/gu, '');
}

export function characterUnits(card: { answerZh: string; pinyin: string } | null): CharacterUnit[] {
  if (!card) return [];

  const pinyinSyllables = pinyinParts(card.pinyin).filter((part) => part.syllable);
  let toneIndex = 0;
  return answerTokens(card.answerZh).map((text, unitIndex) => {
    const pinyin = pinyinSyllables[unitIndex]?.text ?? '';
    const tone = pinyinSyllables[unitIndex]?.tone ?? null;
    const ignoredByToneCoach = /^[A-Z][a-z]+$/u.test(pinyin);
    const resultToneIndex = ignoredByToneCoach ? null : toneIndex;
    if (!ignoredByToneCoach) toneIndex += 1;

    return {
      text,
      pinyin,
      tone,
      unitIndex,
      toneIndex: resultToneIndex,
    };
  });
}
