export type MandarinCard = {
  id: string;
  lessonId: string;
  promptEn: string;
  answerZh: string;
  pinyin: string;
  // URL of a prebuilt, stored audio clip for answerZh (see VISION.md "Prebuilt
  // stored audio"). When present the app plays it directly — no on-the-fly
  // synthesis. Cards without it fall back to the browser's Chinese voice.
  audioUrl?: string;
  // Legacy Kokoro phonemes, kept only for the built-in demo deck. Unused by the
  // prebuilt-audio path; retained so old fallback cards still type-check.
  speechPhonemes?: string;
  notes?: string;
  generated?: boolean;
};

// Built-in demo deck used when /mandarin-source.json is unavailable. This is the
// sample deck the app ships with, so it stays small, generic, and shareable.
export const MANDARIN_FALLBACK_CARDS: MandarinCard[] = [
  {
    id: 'demo-tea',
    lessonId: 'Demo_260620',
    promptEn: 'How would you say: I want to drink tea?',
    answerZh: '我想喝茶。',
    pinyin: 'wo3 xiang3 he1 cha2.',
    speechPhonemes: '我2ㄒ阳3/ㄏㄜ1ㄔㄚ2.',
    notes: '想 + verb means want to do something.',
  },
  {
    id: 'demo-tomorrow',
    lessonId: 'Demo_260620',
    promptEn: 'How would you say: I want to go tomorrow?',
    answerZh: '我明天想去。',
    pinyin: 'wo3 ming2 tian1 xiang3 qu4.',
    speechPhonemes: '我3/ㄇ应2ㄊ言1/ㄒ阳3ㄑㄩ4.',
  },
  {
    id: 'demo-teacher',
    lessonId: 'Review_expanded',
    promptEn: 'How would you ask: Do you have a Chinese teacher?',
    answerZh: '你有汉语老师吗？',
    pinyin: 'ni3 you3 Han4 yu3 lao3 shi1 ma?',
    speechPhonemes: 'ㄋㄧ2又3/ㄏㄢ4ㄩ3/ㄌㄠ3ㄕ十1/ㄇㄚ5?',
    generated: true,
  },
  {
    id: 'demo-family',
    lessonId: 'Review_expanded',
    promptEn: 'How would you say: My family has four people?',
    answerZh: '我家有四口人。',
    pinyin: 'wo3 jia1 you3 si4 kou3 ren2.',
    speechPhonemes: '我3ㄐ压1/又3/ㄙㄭ4ㄎㄡ3/ㄖㄣ2.',
    notes: '口 is the measure word for family members.',
    generated: true,
  },
  {
    id: 'demo-age',
    lessonId: 'Review_expanded',
    promptEn: 'Mary is a young adult. Ask how old she is.',
    answerZh: 'Mary多大？',
    pinyin: 'Mary duo1 da4?',
    speechPhonemes: 'Mary ㄉ我1/ㄉㄚ4?',
    generated: true,
  },
  {
    id: 'demo-daughter',
    lessonId: 'Review_expanded',
    promptEn: 'How would you say: I have two daughters?',
    answerZh: '我有两个女儿。',
    pinyin: 'wo3 you3 liang3 ge nu:3 er2.',
    speechPhonemes: '我2又3/ㄌ阳3ㄍㄜ5/ㄋㄩ3ㄦ2.',
    notes: '女儿 uses ü: nǚ ér.',
    generated: true,
  },
];
