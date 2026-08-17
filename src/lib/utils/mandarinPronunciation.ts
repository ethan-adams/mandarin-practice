export type PronunciationStatus = 'matched' | 'close' | 'missed' | 'no_speech';

export type PronunciationResult = {
  status: PronunciationStatus;
  normalized_expected: string;
  normalized_transcript: string;
  similarity: number;
};

export type RecognitionAlternative = {
  transcript: string;
  confidence?: number;
};

export type UnitPronunciationStatus = 'pending' | 'matched' | 'close' | 'missed' | 'unverified';

export type ToneEvidence = {
  status: 'matched' | 'close' | 'missed' | 'pending';
  observed?: string;
} | null;

export type UnitPronunciationFeedback = {
  status: UnitPronunciationStatus;
  observed: string | null;
  detail: string;
};

export function combineRecognitionResults(results: Iterable<Iterable<RecognitionAlternative>>) {
  const segments = [...results]
    .map((result) =>
      [...result]
        .filter((alternative) => alternative.transcript)
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0],
    )
    .filter((alternative): alternative is RecognitionAlternative => Boolean(alternative));
  const transcript = segments.map((segment) => segment.transcript.trim()).join('');
  const confidence = segments.length
    ? segments.reduce((sum, segment) => sum + (segment.confidence ?? 0), 0) / segments.length
    : 0;

  return { transcript, confidence };
}

const variantMap = new Map<string, string>(
  Object.entries({
    妳: '你',
    祢: '你',
    嗎: '吗',
    麼: '么',
    麽: '么',
    甚: '什',
    裏: '里',
    裡: '里',
    喫: '吃',
    說: '说',
    誰: '谁',
    這: '这',
    那兒: '那儿',
    哪兒: '哪儿',
    兒: '儿',
    們: '们',
    個: '个',
    幾: '几',
    點: '点',
    會: '会',
    想: '想',
    喝: '喝',
    茶: '茶',
  }),
);

const punctuationPattern = /[\s.,!?;:'"()[\]{}，。！？、；：「」『』（）《》〈〉…·~`@#$%^&*_+=|\\/\\-]/gu;

export function normalizeMandarinText(text: string) {
  if (!text) return '';

  let normalized = String(text).normalize('NFKC').toLowerCase();
  for (const [from, to] of variantMap) {
    normalized = normalized.replaceAll(from, to);
  }
  return normalized.replace(punctuationPattern, '');
}

/**
 * Keeps Han characters as individual speech units while retaining Latin names and
 * numbers as whole units. This mirrors the card contract without treating a
 * repeated character as an unordered set membership match.
 */
export function mandarinSpeechUnits(text: string) {
  return normalizeMandarinText(text).match(/[a-z]+|[\p{Script=Han}]|[0-9]+/gu) ?? [];
}

/**
 * Aligns expected and recognized units with a longest-common-subsequence match.
 * A unit can therefore only be heard once, and repeated characters retain their
 * position in the phrase.
 */
export function alignMandarinSpeechUnits(expectedText: string, recognizedText: string) {
  const expected = mandarinSpeechUnits(expectedText);
  const recognized = mandarinSpeechUnits(recognizedText);
  const table = Array.from({ length: expected.length + 1 }, () => Array<number>(recognized.length + 1).fill(0));

  for (let expectedIndex = expected.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let recognizedIndex = recognized.length - 1; recognizedIndex >= 0; recognizedIndex -= 1) {
      table[expectedIndex][recognizedIndex] = expected[expectedIndex] === recognized[recognizedIndex]
        ? table[expectedIndex + 1][recognizedIndex + 1] + 1
        : Math.max(table[expectedIndex + 1][recognizedIndex], table[expectedIndex][recognizedIndex + 1]);
    }
  }

  const observed: Array<string | null> = Array(expected.length).fill(null);
  let expectedIndex = 0;
  let recognizedIndex = 0;
  while (expectedIndex < expected.length && recognizedIndex < recognized.length) {
    if (expected[expectedIndex] === recognized[recognizedIndex]) {
      observed[expectedIndex] = recognized[recognizedIndex];
      expectedIndex += 1;
      recognizedIndex += 1;
    } else if (table[expectedIndex + 1][recognizedIndex] >= table[expectedIndex][recognizedIndex + 1]) {
      expectedIndex += 1;
    } else {
      recognizedIndex += 1;
    }
  }

  return { expected, recognized, observed, matchedCount: table[0][0] };
}

/**
 * Browser recognition establishes that the intended contextual unit was heard;
 * pitch analysis establishes tone. Neither signal may independently award a
 * full pronunciation match.
 */
export function composeUnitPronunciationFeedback({
  observed,
  hasTranscript,
  tone,
}: {
  observed: string | null;
  hasTranscript: boolean;
  tone: ToneEvidence;
}): UnitPronunciationFeedback {
  if (tone?.status === 'pending') return { status: 'pending', observed, detail: 'listening' };

  if (!hasTranscript && !tone) return { status: 'pending', observed: null, detail: 'ready to listen' };

  if (!hasTranscript) {
    const toneDetail = tone ? `tone ${tone.observed ?? tone.status}` : 'tone unavailable';
    return { status: 'unverified', observed: null, detail: `${toneDetail} · syllable unverified` };
  }

  if (!observed) {
    const toneDetail = tone?.status === 'matched' ? 'tone matched' : tone ? `tone ${tone.observed ?? tone.status}` : 'tone unavailable';
    return { status: 'missed', observed: null, detail: `${toneDetail} · expected unit not heard` };
  }

  if (!tone) return { status: 'matched', observed, detail: 'heard' };
  if (tone.status === 'matched') return { status: 'matched', observed, detail: `heard · tone ${tone.observed ?? 'matched'}` };
  if (tone.status === 'close') return { status: 'close', observed, detail: `heard · tone ${tone.observed ?? 'close'}` };
  return { status: 'missed', observed, detail: `heard · tone ${tone.observed ?? 'missed'}` };
}

function characterSimilarity(expected: string, recognized: string) {
  if (!expected || !recognized) return 0;
  const expectedUnits = mandarinSpeechUnits(expected);
  if (!expectedUnits.length) return 0;
  return alignMandarinSpeechUnits(expected, recognized).matchedCount / expectedUnits.length;
}

export function comparePronunciation(expected: string, recognized: string): PronunciationResult {
  const normalizedExpected = normalizeMandarinText(expected);
  const normalizedRecognized = normalizeMandarinText(recognized);

  if (!normalizedRecognized) {
    return {
      status: 'no_speech',
      normalized_expected: normalizedExpected,
      normalized_transcript: normalizedRecognized,
      similarity: 0,
    };
  }

  if (normalizedExpected && normalizedExpected === normalizedRecognized) {
    return {
      status: 'matched',
      normalized_expected: normalizedExpected,
      normalized_transcript: normalizedRecognized,
      similarity: 1,
    };
  }

  const includesExpected =
    normalizedExpected.length >= 2 &&
    (normalizedRecognized.includes(normalizedExpected) || normalizedExpected.includes(normalizedRecognized));
  const similarity = characterSimilarity(normalizedExpected, normalizedRecognized);

  return {
    status: includesExpected || similarity >= 0.6 ? 'close' : 'missed',
    normalized_expected: normalizedExpected,
    normalized_transcript: normalizedRecognized,
    similarity: Number(similarity.toFixed(3)),
  };
}
