import { describe, expect, it } from 'vitest';
import { decodeBenchmarkPcmWav, validateBenchmarkManifest } from './mandarinPronunciationBenchmark';
import {
  buildFixtureEntry,
  buildManifest,
  encodeWavPcm16,
  redactedSummaryLines,
  renderAssessmentSidecar,
  renderConsentRecord,
  synthesizePromptWav,
  synthesizeToneSamples,
  validatePilotPlan,
  type PilotPlan,
  type PilotPrompt,
} from './mandarinTonePilotKit';

// In-memory plan (this src test is type-checked under the browser tsconfig, so it may
// not touch node:fs). The committed pilot-plan.json is validated from the node-side
// integration test in tests/mandarinTonePilotRecorder.test.ts.
function makePrompt(overrides: Partial<PilotPrompt> & Pick<PilotPrompt, 'id' | 'category' | 'synthetic'>): PilotPrompt {
  return {
    han: '妈',
    contextual_pinyin: 'mā',
    instruction: 'Say it.',
    intended: overrides.synthetic.labels[0],
    device_hint: { class: 'phone', environment: 'quiet' },
    ...overrides,
  };
}

const samplePlan: PilotPlan = {
  schema_version: 1,
  corpus_id: 'local-human-pilot',
  description: 'in-memory test plan',
  consent_affirmations: ['Participation is optional.', 'Clips stay local.'],
  prompts: [
    makePrompt({ id: 'sentinel-correct', category: 'sentinel_contrast', synthetic: { tones: [1], labels: ['correct'], rationale: 'r' } }),
    makePrompt({ id: 'sentinel-wrong-initial', category: 'sentinel_contrast', synthetic: { tones: [1], labels: ['wrong_initial'], rationale: 'r' } }),
    makePrompt({ id: 'sentinel-wrong-tone', category: 'sentinel_contrast', synthetic: { tones: [2], labels: ['wrong_tone'], rationale: 'r' } }),
    makePrompt({ id: 'multi', category: 'multi_character', contextual_pinyin: 'nǐ hǎo', han: '你好', synthetic: { tones: [3, 3], labels: ['correct'], rationale: 'r' } }),
    makePrompt({ id: 'repeated', category: 'repeated_unit', han: '谢谢', contextual_pinyin: 'xiè xie', synthetic: { tones: [4, 5], labels: ['correct'], rationale: 'r' } }),
    makePrompt({ id: 'partial', category: 'partial_speech', synthetic: { tones: [3], labels: ['partial_speech'], rationale: 'r' } }),
    makePrompt({ id: 'silent', category: 'no_speech', synthetic: { tones: [], labels: ['no_speech'], rationale: 'r' } }),
    makePrompt({ id: 'unclear', category: 'ambiguous', synthetic: { tones: [3], labels: ['ambiguous'], amplitude: 0.05, rationale: 'r' } }),
  ],
};

describe('pilot plan validation', () => {
  it('accepts a well-formed plan covering every required category', () => {
    expect(validatePilotPlan(samplePlan)).toEqual([]);
  });

  it('reports a missing required category', () => {
    const trimmed: PilotPlan = { ...samplePlan, prompts: samplePlan.prompts.filter((prompt) => prompt.category === 'sentinel_contrast') };
    expect(validatePilotPlan(trimmed)).toContain('prompts must include at least one "multi_character" category entry');
  });

  it('rejects a non-object and a bad label', () => {
    expect(validatePilotPlan(null)).toEqual(['pilot plan must be a JSON object']);
    const bad = { ...samplePlan, prompts: [{ ...samplePlan.prompts[0], synthetic: { tones: [1], labels: ['not_a_label'], rationale: 'x' } }] };
    expect(validatePilotPlan(bad).some((error) => error.includes('labels'))).toBe(true);
  });

  it('rejects combining correct with an error label', () => {
    const bad = { ...samplePlan, prompts: [{ ...samplePlan.prompts[0], synthetic: { tones: [1], labels: ['correct', 'wrong_tone'], rationale: 'x' } }] };
    expect(validatePilotPlan(bad).some((error) => error.includes('correct cannot be combined'))).toBe(true);
  });
});

describe('WAV encoding and synthesis', () => {
  it('encodes a mono PCM16 WAV that the benchmark decoder accepts', () => {
    const samples = synthesizeToneSamples([1], 16000);
    const wav = encodeWavPcm16(samples, 16000);
    const decoded = decodeBenchmarkPcmWav(wav);
    expect(decoded.sampleRate).toBe(16000);
    expect(decoded.samples.length).toBe(samples.length);
    expect(decoded.durationSeconds).toBeGreaterThan(0);
  });

  it('synthesizes voiced audio for tones and a near-silent take for no-speech', () => {
    const voiced = synthesizeToneSamples([2, 4], 16000);
    const rms = Math.sqrt(voiced.reduce((sum, value) => sum + value * value, 0) / voiced.length);
    expect(rms).toBeGreaterThan(0.05);

    const silent = synthesizeToneSamples([], 16000);
    const silentRms = Math.sqrt(silent.reduce((sum, value) => sum + value * value, 0) / silent.length);
    expect(silentRms).toBeLessThan(0.01);
    expect(silent.length).toBeGreaterThan(0); // non-empty data chunk so the runner accepts it
  });

  it('is deterministic so dry-run digests are reproducible', () => {
    const prompt = samplePlan.prompts[0];
    expect(Array.from(synthesizePromptWav(prompt))).toEqual(Array.from(synthesizePromptWav(prompt)));
  });
});

describe('corpus assembly', () => {
  it('builds a manifest that passes the runtime benchmark validator', () => {
    const fixtures = samplePlan.prompts.map((prompt) =>
      buildFixtureEntry(prompt, {
        audioFile: `audio/${prompt.id}.wav`,
        sha256: 'a'.repeat(64),
        speaker: { age_band: 'not_recorded', mandarin_background: 'not_recorded' },
        device: { class: prompt.device_hint.class, environment: prompt.device_hint.environment },
        consent: { provenance_record_id: 'consent-001', obtained_month: '2026-07' },
        annotation: { labels: prompt.synthetic.labels, rationale: prompt.synthetic.rationale, annotator_count: 1 },
      }),
    );
    const manifest = buildManifest(samplePlan, '0.1.0-test', fixtures);
    expect(validateBenchmarkManifest(manifest)).toEqual([]);
  });

  it('links an assessment sidecar and digest when provided, and stays schema-valid', () => {
    const entry = buildFixtureEntry(samplePlan.prompts[0], {
      audioFile: 'audio/x.wav',
      assessmentFile: 'assessments/x.json',
      sha256: 'b'.repeat(64),
      speaker: { age_band: 'not_recorded', mandarin_background: 'not_recorded' },
      device: { class: 'phone', environment: 'quiet' },
      consent: { provenance_record_id: 'consent-001', obtained_month: '2026-07' },
      annotation: { labels: ['correct'], rationale: 'ok', annotator_count: 1 },
    });
    expect(entry.assessment_file).toBe('assessments/x.json');
    expect(entry.sha256).toBe('b'.repeat(64));
    expect(validateBenchmarkManifest(buildManifest(samplePlan, '0.1.0', [entry]))).toEqual([]);
  });

  it('omits optional fields when not provided', () => {
    const entry = buildFixtureEntry(samplePlan.prompts[0], {
      audioFile: 'audio/sample.wav',
      speaker: { age_band: '18_39', mandarin_background: 'additional_language' },
      device: { class: 'phone', environment: 'quiet' },
      consent: { provenance_record_id: 'consent-001', obtained_month: '2026-07' },
      annotation: { labels: ['correct'], rationale: 'ok', annotator_count: 2 },
    });
    expect(entry.sha256).toBeUndefined();
    expect(entry.assessment_file).toBeUndefined();
    expect(entry.consent.status).toBe('explicit');
  });
});

describe('consent and recognition sidecar rendering', () => {
  it('renders a consent record with every affirmation and no identity prompt', () => {
    const record = renderConsentRecord({
      provenanceRecordId: 'consent-001',
      obtainedMonth: '2026-07',
      corpusId: 'local-human-pilot',
      affirmations: samplePlan.consent_affirmations,
      withdrawalContact: 'maintainer',
    });
    for (const affirmation of samplePlan.consent_affirmations) expect(record).toContain(affirmation);
    expect(record).toContain('Do NOT add names');
    expect(record).not.toContain('SYNTHETIC');
  });

  it('marks synthetic consent records so they cannot masquerade as human evidence', () => {
    const record = renderConsentRecord({
      provenanceRecordId: 'consent-dry-run',
      obtainedMonth: '2026-01',
      corpusId: 'local-human-pilot',
      affirmations: samplePlan.consent_affirmations,
      withdrawalContact: 'maintainer',
      synthetic: true,
    });
    expect(record).toContain('SYNTHETIC');
  });

  it('renders an assessment sidecar conforming to the schema shape', () => {
    const sidecar = JSON.parse(renderAssessmentSidecar('pilot-001', { status: 'available', transcript: '妈', confidence: 0.9 }));
    expect(sidecar).toMatchObject({ schema_version: 1, fixture_id: 'pilot-001', recognition: { status: 'available' } });
  });
});

describe('redacted summary', () => {
  it('never prints paths and notes the redaction', () => {
    const lines = redactedSummaryLines({
      corpus_id: 'local-human-pilot',
      corpus_version: '0.1.0',
      sample_count: 2,
      metrics: {
        wrong_tone: { assessed: 2, unassessed: 0, precision: 0.5, recall: 1 },
        correct: { assessed: 0, unassessed: 2, precision: null, recall: null },
      },
    });
    expect(lines.join('\n')).toContain('2 sample(s)');
    expect(lines.join('\n')).toContain('wrong_tone');
    expect(lines.join('\n')).toContain('Redacted');
    const body = lines.filter((line) => !line.startsWith('Redacted')).join('\n');
    expect(body).not.toMatch(/\.wav|audio\//);
  });
});
