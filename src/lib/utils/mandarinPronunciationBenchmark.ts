import {
  alignMandarinSpeechUnits,
  composeUnitPronunciationFeedback,
  type PronunciationResult,
} from './mandarinPronunciation.ts';
import { expectedToneSyllables, type ToneAssessmentResult } from './mandarinToneAssessment.ts';

export const benchmarkLabels = [
  'correct',
  'wrong_initial',
  'wrong_final',
  'wrong_tone',
  'wrong_syllable_or_word',
  'partial_speech',
  'no_speech',
  'ambiguous',
] as const;

export type BenchmarkLabel = (typeof benchmarkLabels)[number];

export type BenchmarkFixture = {
  id: string;
  audio_file: string;
  assessment_file?: string;
  expected: {
    han: string;
    contextual_pinyin: string;
  };
  speaker: {
    age_band: 'under_18' | '18_39' | '40_64' | '65_plus' | 'not_recorded';
    mandarin_background: 'first_language' | 'additional_language' | 'not_recorded';
  };
  device: {
    class: 'phone' | 'computer' | 'external_microphone' | 'other' | 'not_recorded';
    environment: 'quiet' | 'ordinary_indoor' | 'outdoor' | 'background_noise' | 'not_recorded';
  };
  consent: {
    status: 'explicit';
    scope: 'mandarin_pronunciation_benchmark';
    provenance_record_id: string;
    obtained_month: string;
  };
  annotation: {
    labels: BenchmarkLabel[];
    rationale: string;
    annotator_count: number;
  };
  sha256?: string;
};

export type BenchmarkManifest = {
  schema_version: 1;
  corpus_id: string;
  corpus_version: string;
  description: string;
  fixtures: BenchmarkFixture[];
};

export type RecognitionEvidence = {
  status: 'available' | 'unavailable';
  transcript?: string;
  confidence?: number;
};

export type FixtureAssessment = {
  recognition: RecognitionEvidence;
  pronunciation: PronunciationResult | null;
  tone: ToneAssessmentResult | null;
};

export type LabelPrediction = Record<BenchmarkLabel, boolean | null>;

export type FixtureBenchmarkResult = {
  fixture_id: string;
  expected_labels: BenchmarkLabel[];
  predictions: LabelPrediction;
  recognition_status: RecognitionEvidence['status'];
  recognition_confidence: number | null;
  pronunciation_status: PronunciationResult['status'] | 'unavailable';
  tone_status: ToneAssessmentResult['status'] | 'unavailable';
  unit_evidence: Array<{
    unit_index: number;
    expected_unit: string;
    expected_pinyin: string | null;
    recognition_status: 'recognized' | 'not_recognized' | 'unavailable';
    tone_status: 'matched' | 'close' | 'missed' | 'pending' | 'unavailable';
    combined_status: 'pending' | 'matched' | 'close' | 'missed' | 'unverified';
  }>;
  notes: string[];
};

export type ConfusionMetric = {
  true_positive: number;
  false_positive: number;
  true_negative: number;
  false_negative: number;
  assessed: number;
  unassessed: number;
  precision: number | null;
  recall: number | null;
};

export type BenchmarkReport = {
  report_version: 1;
  corpus_id: string;
  corpus_version: string;
  sample_count: number;
  caveat: string;
  metrics: Record<BenchmarkLabel, ConfusionMetric>;
  review: {
    known_false_positives: Array<{ fixture_id: string; label: BenchmarkLabel }>;
    known_false_negatives: Array<{ fixture_id: string; label: BenchmarkLabel }>;
    next_calibration_decisions: string[];
  };
  fixtures: FixtureBenchmarkResult[];
};

export type DecodedBenchmarkAudio = {
  samples: Float32Array;
  sampleRate: number;
  durationSeconds: number;
};

const identifierPattern = /^[a-z0-9][a-z0-9._-]{2,80}$/u;
const shaPattern = /^[a-f0-9]{64}$/u;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/u;

export function validateBenchmarkManifest(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['manifest must be a JSON object'];
  if (value.schema_version !== 1) errors.push('schema_version must be 1');
  if (!isIdentifier(value.corpus_id)) errors.push('corpus_id must be a pseudonymous identifier');
  if (!isNonEmptyString(value.corpus_version)) errors.push('corpus_version is required');
  if (!isNonEmptyString(value.description)) errors.push('description is required');
  if (!Array.isArray(value.fixtures)) {
    errors.push('fixtures must be an array');
    return errors;
  }

  const seen = new Set<string>();
  value.fixtures.forEach((fixture, index) => {
    const prefix = `fixtures[${index}]`;
    if (!isRecord(fixture)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!isIdentifier(fixture.id)) errors.push(`${prefix}.id must be a pseudonymous identifier`);
    if (typeof fixture.id === 'string' && seen.has(fixture.id)) errors.push(`${prefix}.id must be unique`);
    if (typeof fixture.id === 'string') seen.add(fixture.id);
    validateLocalPath(fixture.audio_file, `${prefix}.audio_file`, errors);
    if (fixture.assessment_file !== undefined) validateLocalPath(fixture.assessment_file, `${prefix}.assessment_file`, errors);
    if (fixture.sha256 !== undefined && (typeof fixture.sha256 !== 'string' || !shaPattern.test(fixture.sha256))) {
      errors.push(`${prefix}.sha256 must be a lowercase SHA-256 digest`);
    }
    validateExpected(fixture.expected, `${prefix}.expected`, errors);
    validateSpeaker(fixture.speaker, `${prefix}.speaker`, errors);
    validateDevice(fixture.device, `${prefix}.device`, errors);
    validateConsent(fixture.consent, `${prefix}.consent`, errors);
    validateAnnotation(fixture.annotation, `${prefix}.annotation`, errors);
  });
  return errors;
}

export function decodeBenchmarkPcmWav(bytes: Uint8Array): DecodedBenchmarkAudio {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') {
    throw new Error('Audio must be a RIFF/WAVE file');
  }

  let offset = 12;
  let format: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataOffset = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const contentOffset = offset + 8;
    if (contentOffset + size > bytes.byteLength) throw new Error(`Invalid WAV ${id} chunk length`);
    if (id === 'fmt ') {
      if (size < 16) throw new Error('Invalid WAV format chunk');
      format = {
        audioFormat: view.getUint16(contentOffset, true),
        channels: view.getUint16(contentOffset + 2, true),
        sampleRate: view.getUint32(contentOffset + 4, true),
        bitsPerSample: view.getUint16(contentOffset + 14, true),
      };
    } else if (id === 'data') {
      dataOffset = contentOffset;
      dataSize = size;
    }
    offset = contentOffset + size + (size % 2);
  }

  if (!format || dataOffset < 0 || !dataSize) throw new Error('WAV requires format and non-empty data chunks');
  if (!format.channels || !format.sampleRate) throw new Error('WAV has invalid channel count or sample rate');
  const isPcm16 = format.audioFormat === 1 && format.bitsPerSample === 16;
  const isFloat32 = format.audioFormat === 3 && format.bitsPerSample === 32;
  if (!isPcm16 && !isFloat32) throw new Error('WAV must use PCM signed 16-bit or IEEE float 32-bit samples');

  const bytesPerSample = format.bitsPerSample / 8;
  const frameSize = bytesPerSample * format.channels;
  if (dataSize % frameSize) throw new Error('WAV data is not aligned to complete sample frames');
  const frameCount = dataSize / frameSize;
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < format.channels; channel += 1) {
      const sampleOffset = dataOffset + frame * frameSize + channel * bytesPerSample;
      sum += isPcm16 ? view.getInt16(sampleOffset, true) / 32768 : view.getFloat32(sampleOffset, true);
    }
    samples[frame] = Math.max(-1, Math.min(1, sum / format.channels));
  }
  return { samples, sampleRate: format.sampleRate, durationSeconds: frameCount / format.sampleRate };
}

export function classifyBenchmarkFixture(fixture: BenchmarkFixture, assessment: FixtureAssessment): FixtureBenchmarkResult {
  const recognitionAvailable = assessment.recognition.status === 'available';
  const pronunciation = assessment.pronunciation;
  const tone = assessment.tone;
  const transcriptPresent = Boolean(assessment.recognition.transcript?.trim());
  const predictions = Object.fromEntries(benchmarkLabels.map((label) => [label, null])) as LabelPrediction;
  const notes: string[] = [];
  const alignment = recognitionAvailable
    ? alignMandarinSpeechUnits(fixture.expected.han, assessment.recognition.transcript ?? '')
    : alignMandarinSpeechUnits(fixture.expected.han, '');
  const expectedPinyin = expectedToneSyllables(fixture.expected.contextual_pinyin);
  const unitEvidence: FixtureBenchmarkResult['unit_evidence'] = alignment.expected.map((expectedUnit, unitIndex) => {
    const toneSyllable = tone?.syllables[unitIndex];
    const toneEvidence = toneSyllable
      ? { status: toneSyllable.status, observed: toneSyllable.observed }
      : tone && alignment.expected.length === 1
        ? { status: tone.status === 'no_speech' ? 'missed' as const : tone.status }
        : null;
    const combined = composeUnitPronunciationFeedback({
      observed: alignment.observed[unitIndex] ?? null,
      hasTranscript: transcriptPresent,
      tone: toneEvidence,
    });
    const pinyin = expectedPinyin[unitIndex];
    return {
      unit_index: unitIndex,
      expected_unit: expectedUnit,
      expected_pinyin: pinyin ? `${pinyin.text}${pinyin.tone ?? ''}` : null,
      recognition_status: !recognitionAvailable
        ? 'unavailable' as const
        : alignment.observed[unitIndex]
          ? 'recognized' as const
          : 'not_recognized' as const,
      tone_status: toneSyllable?.status ?? (tone && alignment.expected.length === 1 ? (tone.status === 'no_speech' ? 'missed' : tone.status) : 'unavailable'),
      combined_status: combined.status,
    };
  });

  // Browser recognition offers contextual intelligibility evidence, not direct
  // phoneme evidence. Initial/final errors must remain unassessed.
  if (recognitionAvailable && pronunciation) {
    predictions.wrong_syllable_or_word = pronunciation.status === 'missed';
    predictions.partial_speech = pronunciation.status === 'close';
    predictions.no_speech = pronunciation.status === 'no_speech';
  } else {
    notes.push('segmental labels unassessed because recognition evidence is unavailable');
  }

  if (tone) {
    predictions.wrong_tone = tone.status === 'missed';
    if (recognitionAvailable && pronunciation?.status === 'no_speech') {
      predictions.no_speech = tone.status === 'no_speech';
    }
  } else {
    notes.push('tone label unassessed because usable PCM evidence is unavailable');
  }

  if (recognitionAvailable && pronunciation && tone) {
    predictions.correct = pronunciation.status === 'matched' && tone.status === 'matched';
  }

  if (recognitionAvailable && transcriptPresent && pronunciation?.status !== 'no_speech') {
    predictions.ambiguous = false;
  }

  notes.push('wrong_initial and wrong_final require a validated phoneme assessor and are not inferred from browser text');

  return {
    fixture_id: fixture.id,
    expected_labels: [...fixture.annotation.labels],
    predictions,
    recognition_status: assessment.recognition.status,
    recognition_confidence: assessment.recognition.confidence ?? null,
    pronunciation_status: pronunciation?.status ?? 'unavailable',
    tone_status: tone?.status ?? 'unavailable',
    unit_evidence: unitEvidence,
    notes,
  };
}

export function createBenchmarkReport(manifest: BenchmarkManifest, fixtures: FixtureBenchmarkResult[]): BenchmarkReport {
  const metrics = Object.fromEntries(benchmarkLabels.map((label) => [label, confusionFor(label, fixtures)])) as Record<BenchmarkLabel, ConfusionMetric>;
  const knownFalsePositives: Array<{ fixture_id: string; label: BenchmarkLabel }> = [];
  const knownFalseNegatives: Array<{ fixture_id: string; label: BenchmarkLabel }> = [];
  for (const fixture of fixtures) {
    for (const label of benchmarkLabels) {
      const prediction = fixture.predictions[label];
      const expected = fixture.expected_labels.includes(label);
      if (prediction === true && !expected) knownFalsePositives.push({ fixture_id: fixture.fixture_id, label });
      if (prediction === false && expected) knownFalseNegatives.push({ fixture_id: fixture.fixture_id, label });
    }
  }
  return {
    report_version: 1,
    corpus_id: manifest.corpus_id,
    corpus_version: manifest.corpus_version,
    sample_count: fixtures.length,
    caveat: fixtures.length
      ? 'Results describe this small consented corpus only and are not a population-level accuracy claim.'
      : 'No consented human clips were evaluated; accuracy, false-positive, and false-negative rates are unknown.',
    metrics,
    review: {
      known_false_positives: knownFalsePositives,
      known_false_negatives: knownFalseNegatives,
      next_calibration_decisions: fixtures.length
        ? [
            'Review every false positive and false negative with annotator rationale before changing scorer behavior.',
            'Decide whether coverage and agreement justify a larger consented pilot; do not set a product gate from this corpus alone.',
            'Evaluate a privacy-safe local phoneme adapter before assessing wrong_initial or wrong_final.',
          ]
        : [
            'Collect no data until explicit consent and withdrawal records are in place.',
            'Run the planned 20 - 40 clip pilot before estimating scorer accuracy.',
            'Keep wrong_initial and wrong_final unassessed until a validated local phoneme adapter exists.',
          ],
    },
    fixtures,
  };
}

function confusionFor(label: BenchmarkLabel, fixtures: FixtureBenchmarkResult[]): ConfusionMetric {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  let unassessed = 0;
  for (const fixture of fixtures) {
    const predicted = fixture.predictions[label];
    if (predicted === null) {
      unassessed += 1;
      continue;
    }
    const actual = fixture.expected_labels.includes(label);
    if (predicted && actual) truePositive += 1;
    else if (predicted) falsePositive += 1;
    else if (actual) falseNegative += 1;
    else trueNegative += 1;
  }
  const precisionDenominator = truePositive + falsePositive;
  const recallDenominator = truePositive + falseNegative;
  return {
    true_positive: truePositive,
    false_positive: falsePositive,
    true_negative: trueNegative,
    false_negative: falseNegative,
    assessed: truePositive + falsePositive + trueNegative + falseNegative,
    unassessed,
    precision: precisionDenominator ? roundMetric(truePositive / precisionDenominator) : null,
    recall: recallDenominator ? roundMetric(truePositive / recallDenominator) : null,
  };
}

function validateExpected(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value) || !isNonEmptyString(value.han) || !isNonEmptyString(value.contextual_pinyin)) {
    errors.push(`${path} requires non-empty han and contextual_pinyin`);
  }
}

function validateSpeaker(value: unknown, path: string, errors: string[]) {
  const ages = ['under_18', '18_39', '40_64', '65_plus', 'not_recorded'];
  const backgrounds = ['first_language', 'additional_language', 'not_recorded'];
  if (!isRecord(value) || !ages.includes(String(value.age_band)) || !backgrounds.includes(String(value.mandarin_background))) {
    errors.push(`${path} must contain allowed coarse age_band and mandarin_background values`);
  }
  if (isRecord(value) && Object.keys(value).some((key) => ['name', 'email', 'handle', 'location', 'birth_date'].includes(key))) {
    errors.push(`${path} must not contain direct identity fields`);
  }
}

function validateDevice(value: unknown, path: string, errors: string[]) {
  const classes = ['phone', 'computer', 'external_microphone', 'other', 'not_recorded'];
  const environments = ['quiet', 'ordinary_indoor', 'outdoor', 'background_noise', 'not_recorded'];
  if (!isRecord(value) || !classes.includes(String(value.class)) || !environments.includes(String(value.environment))) {
    errors.push(`${path} must contain allowed coarse class and environment values`);
  }
}

function validateConsent(value: unknown, path: string, errors: string[]) {
  if (
    !isRecord(value)
    || value.status !== 'explicit'
    || value.scope !== 'mandarin_pronunciation_benchmark'
    || !isIdentifier(value.provenance_record_id)
    || typeof value.obtained_month !== 'string'
    || !monthPattern.test(value.obtained_month)
  ) {
    errors.push(`${path} requires explicit scoped consent, a pseudonymous provenance ID, and YYYY-MM month`);
  }
}

function validateAnnotation(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value) || !Array.isArray(value.labels) || !value.labels.length) {
    errors.push(`${path}.labels must be a non-empty array`);
    return;
  }
  const labels = value.labels.map(String);
  if (labels.some((label) => !benchmarkLabels.includes(label as BenchmarkLabel))) errors.push(`${path}.labels contains an unsupported label`);
  if (new Set(labels).size !== labels.length) errors.push(`${path}.labels must not contain duplicates`);
  if (labels.includes('correct') && labels.length > 1) errors.push(`${path}.correct cannot be combined with error labels`);
  if (!isNonEmptyString(value.rationale)) errors.push(`${path}.rationale is required`);
  if (!Number.isInteger(value.annotator_count) || Number(value.annotator_count) < 1) errors.push(`${path}.annotator_count must be a positive integer`);
}

function validateLocalPath(value: unknown, path: string, errors: string[]) {
  if (!isNonEmptyString(value) || value.startsWith('/') || value.startsWith('~') || value.includes('\\') || value.split('/').includes('..')) {
    errors.push(`${path} must be a safe relative POSIX path`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && identifierPattern.test(value);
}

function roundMetric(value: number) {
  return Number(value.toFixed(4));
}

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
