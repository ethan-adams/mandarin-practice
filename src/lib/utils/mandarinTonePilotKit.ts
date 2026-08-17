// Pure, isomorphic core for the guided Mandarin tone-pilot recording kit.
//
// This module intentionally imports nothing from `node:*` so it stays safe for the
// browser build and for fast unit tests that need no microphone, audio, or network.
//
// The synthetic take generator here exercises the corpus/runner plumbing only.
// Synthetic speech must never be labeled or reported as human benchmark evidence:
// dry runs write to a clearly synthetic corpus.

import {
  benchmarkLabels,
  type BenchmarkFixture,
  type BenchmarkLabel,
  type BenchmarkManifest,
} from './mandarinPronunciationBenchmark.ts';

export type DeviceClass = BenchmarkFixture['device']['class'];
export type DeviceEnvironment = BenchmarkFixture['device']['environment'];
export type AgeBand = BenchmarkFixture['speaker']['age_band'];
export type MandarinBackground = BenchmarkFixture['speaker']['mandarin_background'];

export type PilotPromptSynthetic = {
  tones: number[];
  labels: BenchmarkLabel[];
  rationale: string;
  amplitude?: number;
};

export type PilotPrompt = {
  id: string;
  category: string;
  han: string;
  contextual_pinyin: string;
  instruction: string;
  intended: BenchmarkLabel;
  device_hint: { class: DeviceClass; environment: DeviceEnvironment };
  synthetic: PilotPromptSynthetic;
};

export type PilotPlan = {
  schema_version: 1;
  corpus_id: string;
  description: string;
  consent_affirmations: string[];
  prompts: PilotPrompt[];
};

const identifierPattern = /^[a-z0-9][a-z0-9._-]{2,80}$/u;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/u;
const ageBands: AgeBand[] = ['under_18', '18_39', '40_64', '65_plus', 'not_recorded'];
const backgrounds: MandarinBackground[] = ['first_language', 'additional_language', 'not_recorded'];
const deviceClasses: DeviceClass[] = ['phone', 'computer', 'external_microphone', 'other', 'not_recorded'];
const environments: DeviceEnvironment[] = ['quiet', 'ordinary_indoor', 'outdoor', 'background_noise', 'not_recorded'];

// --- Prompt-script (pilot plan) validation --------------------------------------

export function validatePilotPlan(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['pilot plan must be a JSON object'];
  if (value.schema_version !== 1) errors.push('schema_version must be 1');
  if (!isIdentifier(value.corpus_id)) errors.push('corpus_id must be a pseudonymous identifier');
  if (!isNonEmptyString(value.description)) errors.push('description is required');
  if (!Array.isArray(value.consent_affirmations) || !value.consent_affirmations.length
    || !value.consent_affirmations.every(isNonEmptyString)) {
    errors.push('consent_affirmations must be a non-empty array of strings');
  }
  if (!Array.isArray(value.prompts) || !value.prompts.length) {
    errors.push('prompts must be a non-empty array');
    return errors;
  }

  const seen = new Set<string>();
  const categories = new Set<string>();
  value.prompts.forEach((prompt, index) => {
    const prefix = `prompts[${index}]`;
    if (!isRecord(prompt)) {
      errors.push(`${prefix} must be an object`);
      return;
    }
    if (!isIdentifier(prompt.id)) errors.push(`${prefix}.id must be a pseudonymous identifier`);
    if (typeof prompt.id === 'string') {
      if (seen.has(prompt.id)) errors.push(`${prefix}.id must be unique`);
      seen.add(prompt.id);
    }
    if (!isNonEmptyString(prompt.category)) errors.push(`${prefix}.category is required`);
    else categories.add(prompt.category);
    if (!isNonEmptyString(prompt.han)) errors.push(`${prefix}.han is required`);
    if (!isNonEmptyString(prompt.contextual_pinyin)) errors.push(`${prefix}.contextual_pinyin is required`);
    if (!isNonEmptyString(prompt.instruction)) errors.push(`${prefix}.instruction is required`);
    if (!isLabel(prompt.intended)) errors.push(`${prefix}.intended must be a benchmark label`);
    if (!isRecord(prompt.device_hint)
      || !deviceClasses.includes(prompt.device_hint.class as DeviceClass)
      || !environments.includes(prompt.device_hint.environment as DeviceEnvironment)) {
      errors.push(`${prefix}.device_hint must set an allowed class and environment`);
    }
    validateSynthetic(prompt.synthetic, `${prefix}.synthetic`, errors);
  });

  // The pilot plan must cover every category the documented pilot requires.
  for (const required of ['sentinel_contrast', 'multi_character', 'repeated_unit', 'partial_speech', 'no_speech', 'ambiguous']) {
    if (!categories.has(required)) errors.push(`prompts must include at least one "${required}" category entry`);
  }
  return errors;
}

function validateSynthetic(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) {
    errors.push(`${path} is required`);
    return;
  }
  if (!Array.isArray(value.tones) || !value.tones.every((tone) => Number.isInteger(tone) && (tone as number) >= 1 && (tone as number) <= 5)) {
    errors.push(`${path}.tones must be an array of tone numbers 1-5 (empty for no-speech)`);
  }
  if (!Array.isArray(value.labels) || !value.labels.length || !value.labels.every(isLabel)) {
    errors.push(`${path}.labels must be a non-empty array of benchmark labels`);
  } else if (value.labels.includes('correct') && value.labels.length > 1) {
    errors.push(`${path}.labels: correct cannot be combined with error labels`);
  }
  if (!isNonEmptyString(value.rationale)) errors.push(`${path}.rationale is required`);
  if (value.amplitude !== undefined && (typeof value.amplitude !== 'number' || value.amplitude <= 0 || value.amplitude > 1)) {
    errors.push(`${path}.amplitude, when set, must be in (0, 1]`);
  }
}

// --- Synthetic take generation (dry-run plumbing only) --------------------------

const TONE_CONTOURS: Record<number, number[]> = {
  1: [200, 200, 200],
  2: [140, 175, 240],
  3: [180, 130, 120, 175],
  4: [250, 200, 130],
  5: [180, 175],
};

// Deterministic (no Math.random) so dry-run digests are reproducible across runs.
export function synthesizeToneSamples(
  tones: number[],
  sampleRate: number,
  options: { amplitude?: number; syllableSeconds?: number; gapSeconds?: number } = {},
): Float32Array {
  const amplitude = options.amplitude ?? 0.25;
  const syllableSeconds = options.syllableSeconds ?? 0.34;
  const gapSeconds = options.gapSeconds ?? 0.08;

  if (!tones.length) {
    // No-speech take: a short, near-silent deterministic hum below the voicing gate.
    const length = Math.round(sampleRate * 0.45);
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      samples[index] = 0.002 * Math.sin((2 * Math.PI * 60 * index) / sampleRate);
    }
    return samples;
  }

  const perSyllable = Math.round(sampleRate * syllableSeconds);
  const gap = Math.round(sampleRate * gapSeconds);
  const total = tones.length * perSyllable + Math.max(tones.length - 1, 0) * gap;
  const samples = new Float32Array(total);
  let cursor = 0;
  let phase = 0;
  for (let syllable = 0; syllable < tones.length; syllable += 1) {
    const contour = TONE_CONTOURS[tones[syllable]] ?? TONE_CONTOURS[1];
    for (let index = 0; index < perSyllable; index += 1) {
      const position = index / perSyllable;
      const frequency = interpolateContour(contour, position);
      phase += (2 * Math.PI * frequency) / sampleRate;
      // Gentle raised-cosine envelope so segment edges do not click.
      const envelope = 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(position, 1));
      samples[cursor++] = amplitude * envelope * Math.sin(phase);
    }
    cursor += gap; // silence between syllables
  }
  return samples;
}

function interpolateContour(contour: number[], position: number): number {
  if (contour.length === 1) return contour[0];
  const scaled = position * (contour.length - 1);
  const lower = Math.min(Math.floor(scaled), contour.length - 2);
  const fraction = scaled - lower;
  return contour[lower] * (1 - fraction) + contour[lower + 1] * fraction;
}

export function synthesizePromptWav(prompt: PilotPrompt, sampleRate = 16000): Uint8Array {
  const samples = synthesizeToneSamples(prompt.synthetic.tones, sampleRate, {
    amplitude: prompt.synthetic.amplitude,
  });
  return encodeWavPcm16(samples, sampleRate);
}

// --- WAV encoding (PCM signed 16-bit, mono) -------------------------------------

export function encodeWavPcm16(samples: Float32Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audioFormat = PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * bytesPerSample, Math.round(clamped * 32767), true);
  }
  return new Uint8Array(buffer);
}

// --- Corpus assembly ------------------------------------------------------------

export type TakeAnnotation = {
  labels: BenchmarkLabel[];
  rationale: string;
  annotator_count: number;
};

export type TakeMetadata = {
  audioFile: string;
  assessmentFile?: string;
  sha256?: string;
  speaker: { age_band: AgeBand; mandarin_background: MandarinBackground };
  device: { class: DeviceClass; environment: DeviceEnvironment };
  consent: { provenance_record_id: string; obtained_month: string };
  annotation: TakeAnnotation;
};

export function buildFixtureEntry(prompt: PilotPrompt, take: TakeMetadata): BenchmarkFixture {
  const entry: BenchmarkFixture = {
    id: prompt.id,
    audio_file: take.audioFile,
    expected: { han: prompt.han, contextual_pinyin: prompt.contextual_pinyin },
    speaker: { age_band: take.speaker.age_band, mandarin_background: take.speaker.mandarin_background },
    device: { class: take.device.class, environment: take.device.environment },
    consent: {
      status: 'explicit',
      scope: 'mandarin_pronunciation_benchmark',
      provenance_record_id: take.consent.provenance_record_id,
      obtained_month: take.consent.obtained_month,
    },
    annotation: {
      labels: [...take.annotation.labels],
      rationale: take.annotation.rationale,
      annotator_count: take.annotation.annotator_count,
    },
  };
  if (take.assessmentFile) entry.assessment_file = take.assessmentFile;
  if (take.sha256) entry.sha256 = take.sha256;
  return entry;
}

export function buildManifest(plan: PilotPlan, corpusVersion: string, fixtures: BenchmarkFixture[]): BenchmarkManifest {
  return {
    schema_version: 1,
    corpus_id: plan.corpus_id,
    corpus_version: corpusVersion,
    description: plan.description,
    fixtures,
  };
}

// --- Consent + recognition sidecar rendering ------------------------------------

export function renderConsentRecord(input: {
  provenanceRecordId: string;
  obtainedMonth: string;
  corpusId: string;
  affirmations: string[];
  fixtureIds?: string[];
  withdrawalContact: string;
  synthetic?: boolean;
}): string {
  const lines = [
    `# Consent record ${input.provenanceRecordId}`,
    '',
    input.synthetic
      ? '> SYNTHETIC placeholder generated by a dry run. Contains no human evidence and must never be reported as one.'
      : '> Pseudonymous consent record. Do NOT add names, emails, handles, exact dates, or locations here.',
    '',
    `- Corpus: \`${input.corpusId}\``,
    '- Scope: `mandarin_pronunciation_benchmark`',
    '- Status: explicit',
    `- Consent month: ${input.obtainedMonth}`,
    `- Withdrawal contact: ${input.withdrawalContact}`,
    '',
    '## Affirmations',
    '',
    ...input.affirmations.map((affirmation, index) => `${index + 1}. ${affirmation}`),
    '',
    '## Linked fixture IDs',
    '',
    ...(input.fixtureIds && input.fixtureIds.length
      ? input.fixtureIds.map((id) => `- ${id}`)
      : ['- (added as clips are recorded)']),
    '',
    '## Withdrawal',
    '',
    'To withdraw, delete the linked audio, assessment sidecars, this consent record, and the',
    'matching manifest fixtures; increment the corpus version; regenerate every report. Never',
    'reuse a withdrawn fixture ID.',
    '',
  ];
  return `${lines.join('\n')}`;
}

export function renderAssessmentSidecar(fixtureId: string, recognition:
  | { status: 'unavailable' }
  | { status: 'available'; transcript: string; confidence?: number }): string {
  const payload = {
    schema_version: 1 as const,
    fixture_id: fixtureId,
    recognition,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

// --- Redacted summary for terminal output ---------------------------------------

type MinimalReport = {
  corpus_id: string;
  corpus_version: string;
  sample_count: number;
  metrics: Record<string, { assessed: number; unassessed: number; precision: number | null; recall: number | null }>;
};

export function redactedSummaryLines(report: MinimalReport): string[] {
  const lines = [
    `Corpus ${report.corpus_id} @ ${report.corpus_version}: ${report.sample_count} sample(s).`,
  ];
  for (const label of benchmarkLabels) {
    const metric = report.metrics[label];
    if (!metric || (metric.assessed === 0 && metric.unassessed === 0)) continue;
    const precision = metric.precision === null ? 'n/a' : metric.precision.toFixed(2);
    const recall = metric.recall === null ? 'n/a' : metric.recall.toFixed(2);
    lines.push(`  ${label.padEnd(24)} assessed=${metric.assessed} unassessed=${metric.unassessed} precision=${precision} recall=${recall}`);
  }
  lines.push('Redacted: no audio paths, transcripts, consent paths, or speaker detail are printed.');
  return lines;
}

// --- Shared guards --------------------------------------------------------------

export function isValidMonth(value: string): boolean {
  return monthPattern.test(value);
}

export function isPseudonymousIdentifier(value: string): boolean {
  return identifierPattern.test(value);
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
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

function isLabel(value: unknown): value is BenchmarkLabel {
  return typeof value === 'string' && (benchmarkLabels as readonly string[]).includes(value);
}
