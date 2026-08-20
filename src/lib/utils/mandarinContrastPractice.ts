export type ContrastCategory = 'tone' | 'zh_z' | 'ch_c' | 'sh_s' | 'n_l' | 'jqx_u' | 'in_ing';

export type ContrastCue = {
  id: string;
  han: string;
  pinyin: string;
  gloss: string;
  speechPhonemes: string;
  // Optional prebuilt clip; contrast cues currently use the browser voice.
  audioUrl?: string;
};

export type ContrastPair = {
  id: string;
  category: ContrastCategory;
  label: string;
  prompt: string;
  target: ContrastCue;
  contrast: ContrastCue;
};

export const MANDARIN_CONTRAST_PAIRS: readonly ContrastPair[] = [
  {
    id: 'tone-1-2',
    category: 'tone',
    label: 'First and second tone',
    prompt: 'Listen for level mā versus rising má.',
    target: { id: 'mama-1', han: '妈妈', pinyin: 'māma', gloss: 'mother', speechPhonemes: 'ㄇㄚ1ㄇㄚ5' },
    contrast: { id: 'mafan-2', han: '麻烦', pinyin: 'máfan', gloss: 'trouble; to bother', speechPhonemes: 'ㄇㄚ2ㄈㄢ5' },
  },
  {
    id: 'tone-1-3',
    category: 'tone',
    label: 'First and third tone',
    prompt: 'Listen for level mā versus dipping mǎ.',
    target: { id: 'mama-1b', han: '妈妈', pinyin: 'māma', gloss: 'mother', speechPhonemes: 'ㄇㄚ1ㄇㄚ5' },
    contrast: { id: 'mashang-3', han: '马上', pinyin: 'mǎshàng', gloss: 'right away', speechPhonemes: 'ㄇㄚ3ㄕㄤ4' },
  },
  {
    id: 'tone-1-4',
    category: 'tone',
    label: 'First and fourth tone',
    prompt: 'Listen for level mā versus falling mà.',
    target: { id: 'mama-1c', han: '妈妈', pinyin: 'māma', gloss: 'mother', speechPhonemes: 'ㄇㄚ1ㄇㄚ5' },
    contrast: { id: 'maren-4', han: '骂人', pinyin: 'mà rén', gloss: 'scold someone', speechPhonemes: 'ㄇㄚ4ㄖㄣ2' },
  },
  {
    id: 'zh-z',
    category: 'zh_z',
    label: 'zh and z',
    prompt: 'Listen for zh in zhīdào versus z in zīliào.',
    target: { id: 'zhidao', han: '知道', pinyin: 'zhīdào', gloss: 'to know', speechPhonemes: 'ㄓ十1ㄉㄠ4' },
    contrast: { id: 'ziliao', han: '资料', pinyin: 'zīliào', gloss: 'materials; information', speechPhonemes: 'ㄗㄭ1ㄌ要4' },
  },
  {
    id: 'ch-c',
    category: 'ch_c',
    label: 'ch and c',
    prompt: 'Listen for ch in chīfàn versus c in cídiǎn.',
    target: { id: 'chifan', han: '吃饭', pinyin: 'chīfàn', gloss: 'eat a meal', speechPhonemes: 'ㄔ十1ㄈㄢ4' },
    contrast: { id: 'cidian', han: '词典', pinyin: 'cídiǎn', gloss: 'dictionary', speechPhonemes: 'ㄘㄭ2ㄉ言3' },
  },
  {
    id: 'sh-s',
    category: 'sh_s',
    label: 'sh and s',
    prompt: 'Listen for sh in lǎoshī versus s in gōngsī.',
    target: { id: 'laoshi', han: '老师', pinyin: 'lǎoshī', gloss: 'teacher', speechPhonemes: 'ㄌㄠ3ㄕ十1' },
    contrast: { id: 'gongsi', han: '公司', pinyin: 'gōngsī', gloss: 'company', speechPhonemes: 'ㄍ中1ㄙㄭ1' },
  },
  {
    id: 'n-l',
    category: 'n_l',
    label: 'n and l',
    prompt: 'Listen for nǚ in nǚ’ér versus lǚ in lǚyóu.',
    target: { id: 'nuer', han: '女儿', pinyin: 'nǚ’ér', gloss: 'daughter', speechPhonemes: 'ㄋㄩ3ㄦ2' },
    contrast: { id: 'luyou', han: '旅游', pinyin: 'lǚyóu', gloss: 'to travel', speechPhonemes: 'ㄌㄩ3又2' },
  },
  {
    id: 'jq-u',
    category: 'jqx_u',
    label: 'j and q before ü',
    prompt: 'Listen for jū versus qū; written u represents ü after j, q, and x.',
    target: { id: 'juzhu', han: '居住', pinyin: 'jūzhù', gloss: 'to reside', speechPhonemes: 'ㄐㄩ1ㄓㄨ4' },
    contrast: { id: 'quyu', han: '区域', pinyin: 'qūyù', gloss: 'region', speechPhonemes: 'ㄑㄩ1ㄩ4' },
  },
  {
    id: 'qx-u',
    category: 'jqx_u',
    label: 'q and x before ü',
    prompt: 'Listen for qū versus xū; both use the ü vowel.',
    target: { id: 'quyu-b', han: '区域', pinyin: 'qūyù', gloss: 'region', speechPhonemes: 'ㄑㄩ1ㄩ4' },
    contrast: { id: 'xuyao', han: '需要', pinyin: 'xūyào', gloss: 'to need', speechPhonemes: 'ㄒㄩ1要4' },
  },
  {
    id: 'in-ing',
    category: 'in_ing',
    label: '-in and -ing',
    prompt: 'Listen for the shorter -in in jīntiān versus -ing in jīngcháng.',
    target: { id: 'jintian', han: '今天', pinyin: 'jīntiān', gloss: 'today', speechPhonemes: 'ㄐ阴1ㄊ言1' },
    contrast: { id: 'jingchang', han: '经常', pinyin: 'jīngcháng', gloss: 'often', speechPhonemes: 'ㄐ应1ㄔㄤ2' },
  },
];

export type PronunciationExplanationKind =
  | 'matched'
  | 'unit_not_recognized'
  | 'tone_not_passed'
  | 'partial_or_no_speech'
  | 'unverified';

export type PronunciationExplanation = {
  kind: PronunciationExplanationKind;
  title: string;
  detail: string;
  ariaLabel: string;
};

export function explainPronunciationEvidence({
  expectedUnit,
  expectedPinyin,
  observedUnit,
  recognitionAvailable,
  hasTranscript,
  toneStatus,
}: {
  expectedUnit: string;
  expectedPinyin: string;
  observedUnit: string | null;
  recognitionAvailable: boolean;
  hasTranscript: boolean;
  toneStatus: 'matched' | 'close' | 'missed' | 'pending' | null;
}): PronunciationExplanation {
  const expected = `${expectedUnit}${expectedPinyin ? ` (${expectedPinyin})` : ''}`;
  if (!recognitionAvailable) {
    const detail = toneStatus
      ? `Tone evidence was ${toneStatus}, but speech recognition is unavailable, so the syllable is unverified.`
      : 'Speech recognition is unavailable, so this attempt is unverified. Manual rating still works.';
    return { kind: 'unverified', title: 'Pronunciation unverified', detail, ariaLabel: `${expected}. ${detail}` };
  }
  if (!hasTranscript) {
    const detail = 'The app did not receive enough speech to compare with the expected unit. Try again or rate it manually.';
    return { kind: 'partial_or_no_speech', title: 'Partial or no speech', detail, ariaLabel: `${expected}. ${detail}` };
  }
  if (!observedUnit) {
    const toneDetail = toneStatus === 'matched' ? ' The tone contour passed, but that alone cannot verify the syllable.' : '';
    const detail = `The app did not hear the expected ${expected}.${toneDetail}`;
    return { kind: 'unit_not_recognized', title: 'Expected unit not recognized', detail, ariaLabel: detail };
  }
  if (toneStatus === 'missed' || toneStatus === 'close') {
    const detail = `The app heard ${observedUnit}, but the tone did not pass for ${expected}. Listen once, then try again.`;
    return { kind: 'tone_not_passed', title: 'Tone needs another try', detail, ariaLabel: detail };
  }
  if (!toneStatus || toneStatus === 'pending') {
    const detail = `The app heard ${observedUnit}; tone evidence is not complete, so use your manual rating.`;
    return { kind: 'unverified', title: 'Tone unverified', detail, ariaLabel: detail };
  }
  const detail = `The app heard ${observedUnit}, and the tone passed for ${expected}.`;
  return { kind: 'matched', title: 'Unit and tone matched', detail, ariaLabel: detail };
}

function plainPinyin(value: string) {
  return value
    .toLowerCase()
    .replaceAll('u:', 'ü')
    .replaceAll('v', 'ü')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zü\s1-5]/g, ' ');
}

export function contrastCategoryForPinyin(pinyin: string): ContrastCategory | null {
  const value = plainPinyin(pinyin);
  if (/[a-zü]+in(?:[1-5])?(?:\s|$)/.test(value) || /[a-zü]+ing(?:[1-5])?(?:\s|$)/.test(value)) return 'in_ing';
  if (/(^|\s)[jqx](?:u|ü)/.test(value)) return 'jqx_u';
  if (/(^|\s)zh/.test(value) || /(^|\s)z(?:i|[aeouü])/.test(value)) return 'zh_z';
  if (/(^|\s)ch/.test(value) || /(^|\s)c(?:i|[aeouü])/.test(value)) return 'ch_c';
  if (/(^|\s)sh/.test(value) || /(^|\s)s(?:i|[aeouü])/.test(value)) return 'sh_s';
  if (/(^|\s)[nl][aeiouü]/.test(value)) return 'n_l';
  if (/[1-4]/.test(value) || /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(pinyin)) return 'tone';
  return null;
}

export function contrastPairForPinyin(pinyin: string) {
  const category = contrastCategoryForPinyin(pinyin);
  return category ? (MANDARIN_CONTRAST_PAIRS.find((pair) => pair.category === category) ?? null) : null;
}

export type ManualPracticeRating = 'correct' | 'hard' | 'wrong';
export type PronunciationEvidenceStatus = 'missed' | 'close' | 'no_speech' | 'unverified';

export type PronunciationEvidence = {
  expectedUnit: string;
  category: ContrastCategory;
  assessmentStatus: PronunciationEvidenceStatus;
  confidence: number;
  timestamp: string;
  manualRating: ManualPracticeRating;
};

const maximumEvidenceEntries = 80;
const recommendationConfidence = 0.72;

export function appendPronunciationEvidence(
  existing: readonly PronunciationEvidence[],
  evidence: PronunciationEvidence,
): PronunciationEvidence[] {
  const compact: PronunciationEvidence = {
    expectedUnit: evidence.expectedUnit.slice(0, 12),
    category: evidence.category,
    assessmentStatus: evidence.assessmentStatus,
    confidence: Math.max(0, Math.min(1, Number(evidence.confidence.toFixed(3)))),
    timestamp: evidence.timestamp,
    manualRating: evidence.manualRating,
  };
  return [...existing, compact].slice(-maximumEvidenceEntries);
}

export function resetPronunciationEvidence(): PronunciationEvidence[] {
  return [];
}

export type ContrastRecommendation = {
  category: ContrastCategory;
  pair: ContrastPair;
  qualifyingAttempts: number;
};

export function recommendContrastDrill(evidence: readonly PronunciationEvidence[]): ContrastRecommendation | null {
  const byCategory = new Map<ContrastCategory, Set<string>>();
  for (const item of evidence) {
    if (
      item.assessmentStatus !== 'missed' ||
      item.confidence < recommendationConfidence ||
      item.manualRating === 'correct'
    ) continue;
    const attempts = byCategory.get(item.category) ?? new Set<string>();
    attempts.add(item.timestamp);
    byCategory.set(item.category, attempts);
  }
  const candidate = [...byCategory.entries()]
    .filter(([, attempts]) => attempts.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)[0];
  if (!candidate) return null;
  const pair = MANDARIN_CONTRAST_PAIRS.find((item) => item.category === candidate[0]);
  return pair ? { category: candidate[0], pair, qualifyingAttempts: candidate[1].size } : null;
}

export type ContrastDrillStep = 'hear_target' | 'hear_contrast' | 'speak_target' | 'rate' | 'complete';
export type ContrastDrillState = { pairId: string; step: ContrastDrillStep; retries: number; rating: ManualPracticeRating | null };

export function createContrastDrill(pairId: string): ContrastDrillState {
  return { pairId, step: 'hear_target', retries: 0, rating: null };
}

export function updateContrastDrill(
  state: ContrastDrillState,
  action: 'target_played' | 'contrast_played' | 'spoke' | 'retry' | 'skip' | ManualPracticeRating,
): ContrastDrillState {
  if (action === 'retry') return { ...state, step: 'hear_target', retries: state.retries + 1, rating: null };
  if (action === 'skip') return { ...state, step: 'complete', rating: null };
  if (action === 'target_played' && state.step === 'hear_target') return { ...state, step: 'hear_contrast' };
  if (action === 'contrast_played' && state.step === 'hear_contrast') return { ...state, step: 'speak_target' };
  if (action === 'spoke' && state.step === 'speak_target') return { ...state, step: 'rate' };
  if ((action === 'correct' || action === 'hard' || action === 'wrong') && state.step === 'rate') {
    return { ...state, step: 'complete', rating: action };
  }
  return state;
}

export type ListeningConfidence = 'low' | 'medium' | 'high';
export type ListeningRound = {
  pairId: string;
  heardCueId: string;
  selectedCueId: string | null;
  revealed: boolean;
  correct: boolean | null;
  confidence: ListeningConfidence | null;
  audioUnavailable: boolean;
};

export type ListeningResult = {
  pairId: string;
  heardCueId: string;
  correct: boolean;
  confidence: ListeningConfidence;
  timestamp: string;
};

export type ListeningHistory = { results: ListeningResult[]; totalCompleted: number };
const maximumListeningResults = 200;

export function appendListeningResult(
  results: readonly ListeningResult[],
  totalCompleted: number,
  result: ListeningResult,
): ListeningHistory {
  return {
    results: [...results, result].slice(-maximumListeningResults),
    totalCompleted: Math.max(totalCompleted, results.length) + 1,
  };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createListeningRound(seed: string, completedCount: number): ListeningRound {
  const pairIndex = (stableHash(seed) + completedCount) % MANDARIN_CONTRAST_PAIRS.length;
  const pair = MANDARIN_CONTRAST_PAIRS[pairIndex];
  const heardCueId = stableHash(`${seed}:${completedCount}:${pair.id}`) % 2 ? pair.target.id : pair.contrast.id;
  return { pairId: pair.id, heardCueId, selectedCueId: null, revealed: false, correct: null, confidence: null, audioUnavailable: false };
}

export function selectListeningAnswer(round: ListeningRound, cueId: string): ListeningRound {
  if (round.revealed) return round;
  return { ...round, selectedCueId: cueId };
}

export function revealListeningAnswer(round: ListeningRound): ListeningRound {
  if (!round.selectedCueId) return round;
  return { ...round, revealed: true, correct: round.selectedCueId === round.heardCueId };
}

export function markListeningAudioUnavailable(round: ListeningRound): ListeningRound {
  return { ...round, audioUnavailable: true };
}

export function completeListeningRound(
  round: ListeningRound,
  confidence: ListeningConfidence,
  timestamp: string,
): { round: ListeningRound; result: ListeningResult | null } {
  if (!round.revealed || round.correct === null) return { round, result: null };
  return {
    round: { ...round, confidence },
    result: { pairId: round.pairId, heardCueId: round.heardCueId, correct: round.correct, confidence, timestamp },
  };
}

export function listeningPair(round: ListeningRound) {
  return MANDARIN_CONTRAST_PAIRS.find((pair) => pair.id === round.pairId) ?? MANDARIN_CONTRAST_PAIRS[0];
}

export function listeningCue(round: ListeningRound) {
  const pair = listeningPair(round);
  return pair.target.id === round.heardCueId ? pair.target : pair.contrast;
}
