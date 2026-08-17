import { describe, expect, it } from 'vitest';
import {
  classifyBenchmarkFixture,
  createBenchmarkReport,
  decodeBenchmarkPcmWav,
  type BenchmarkFixture,
  type BenchmarkManifest,
  validateBenchmarkManifest,
} from './mandarinPronunciationBenchmark';

const fixture: BenchmarkFixture = {
  id: 'pilot-001',
  audio_file: 'audio/pilot-001.wav',
  assessment_file: 'assessments/pilot-001.json',
  expected: { han: '妈', contextual_pinyin: 'mā' },
  speaker: { age_band: '18_39', mandarin_background: 'additional_language' },
  device: { class: 'phone', environment: 'quiet' },
  consent: {
    status: 'explicit',
    scope: 'mandarin_pronunciation_benchmark',
    provenance_record_id: 'consent-001',
    obtained_month: '2026-07',
  },
  annotation: { labels: ['wrong_tone'], rationale: 'Two annotators heard a rising rather than level tone.', annotator_count: 2 },
};

const manifest: BenchmarkManifest = {
  schema_version: 1,
  corpus_id: 'local-pilot',
  corpus_version: '0.1.0',
  description: 'Local consented pilot',
  fixtures: [fixture],
};

describe('Mandarin human-speech benchmark contract', () => {
  it('accepts a valid pseudonymous manifest and rejects direct identity fields', () => {
    expect(validateBenchmarkManifest(manifest)).toEqual([]);
    const unsafe = structuredClone(manifest) as unknown as { fixtures: Array<Record<string, unknown>> };
    unsafe.fixtures[0].speaker = { ...fixture.speaker, name: 'Do not store this' };
    expect(validateBenchmarkManifest(unsafe)).toContain('fixtures[0].speaker must not contain direct identity fields');
  });

  it('rejects unsafe paths and incompatible labels', () => {
    const invalid = structuredClone(manifest);
    invalid.fixtures[0].audio_file = '../private.wav';
    invalid.fixtures[0].annotation.labels = ['correct', 'wrong_tone'];
    expect(validateBenchmarkManifest(invalid)).toEqual(expect.arrayContaining([
      'fixtures[0].audio_file must be a safe relative POSIX path',
      'fixtures[0].annotation.correct cannot be combined with error labels',
    ]));
  });

  it('uses browser-equivalent segmental and production tone evidence conservatively', () => {
    const result = classifyBenchmarkFixture(fixture, {
      recognition: { status: 'available', transcript: '妈', confidence: 0.91 },
      pronunciation: {
        status: 'matched',
        normalized_expected: '妈',
        normalized_transcript: '妈',
        similarity: 1,
      },
      tone: { status: 'missed', score: 30, voicedFrameCount: 14, syllables: [] },
    });

    expect(result.predictions.wrong_tone).toBe(true);
    expect(result.predictions.correct).toBe(false);
    expect(result.predictions.wrong_initial).toBeNull();
    expect(result.predictions.wrong_final).toBeNull();
    expect(result.unit_evidence).toEqual([{
      unit_index: 0,
      expected_unit: '妈',
      expected_pinyin: 'ma1',
      recognition_status: 'recognized',
      tone_status: 'missed',
      combined_status: 'missed',
    }]);
    expect(result).not.toHaveProperty('transcript');
    expect(result).not.toHaveProperty('audio_file');
  });

  it('reports confusion counts while separating unsupported assessments', () => {
    const result = classifyBenchmarkFixture(fixture, {
      recognition: { status: 'available', transcript: '妈', confidence: 0.91 },
      pronunciation: {
        status: 'matched',
        normalized_expected: '妈',
        normalized_transcript: '妈',
        similarity: 1,
      },
      tone: { status: 'missed', score: 30, voicedFrameCount: 14, syllables: [] },
    });
    const report = createBenchmarkReport(manifest, [result]);

    expect(report.metrics.wrong_tone).toMatchObject({ true_positive: 1, precision: 1, recall: 1, assessed: 1 });
    expect(report.metrics.wrong_initial).toMatchObject({ assessed: 0, unassessed: 1, precision: null, recall: null });
  });

  it('keeps an empty recognition result tone-only and syllable-unverified', () => {
    const result = classifyBenchmarkFixture(fixture, {
      recognition: { status: 'available', transcript: '', confidence: 0 },
      pronunciation: {
        status: 'no_speech',
        normalized_expected: '妈',
        normalized_transcript: '',
        similarity: 0,
      },
      tone: { status: 'matched', score: 90, voicedFrameCount: 14, syllables: [] },
    });

    expect(result.unit_evidence[0]).toMatchObject({
      recognition_status: 'not_recognized',
      tone_status: 'matched',
      combined_status: 'unverified',
    });
  });

  it('makes a zero-sample baseline explicit', () => {
    const emptyManifest = { ...manifest, fixtures: [] };
    const report = createBenchmarkReport(emptyManifest, []);

    expect(report.sample_count).toBe(0);
    expect(report.caveat).toContain('No consented human clips');
    expect(report.metrics.correct.precision).toBeNull();
    expect(report.review.known_false_positives).toEqual([]);
    expect(report.review.next_calibration_decisions).toContain('Run the planned 20 - 40 clip pilot before estimating scorer accuracy.');
  });

  it('decodes PCM16 WAV at the local audio boundary', () => {
    const bytes = pcm16Wav([0, 16384, -16384, 32767], 8_000);
    const decoded = decodeBenchmarkPcmWav(bytes);

    expect(decoded.sampleRate).toBe(8_000);
    expect(decoded.durationSeconds).toBe(0.0005);
    expect([...decoded.samples]).toEqual(expect.arrayContaining([0, 0.5, -0.5]));
    expect(() => decodeBenchmarkPcmWav(new Uint8Array(44))).toThrow('RIFF/WAVE');
  });
});

function pcm16Wav(samples: number[], sampleRate: number) {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  writeAscii(bytes, 0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  writeAscii(bytes, 8, 'WAVE');
  writeAscii(bytes, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(bytes, 36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return bytes;
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}
