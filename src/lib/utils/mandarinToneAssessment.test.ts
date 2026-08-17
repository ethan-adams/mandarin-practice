import { describe, expect, it } from 'vitest';
import { assessmentWindow } from './mandarinSpeechBoundary';
import {
  assessToneContours,
  describeToneAssessment,
  detectPitchFromTimeDomain,
  expectedToneSyllables,
  MIN_GRADED_VOICED_FRAMES,
  TONE_FEEDBACK_EXPERIMENTAL,
  TONE_FEEDBACK_EXPERIMENTAL_HINT,
  TONE_FEEDBACK_EXPERIMENTAL_LABEL,
  toneAssessmentHasVerdict,
  type PitchFrame,
  type ToneAssessmentResult,
  type ToneStatus,
  type ToneSyllableResult,
} from './mandarinToneAssessment';

function framesFor(pitches: number[][]): PitchFrame[] {
  let time = 0;
  const frames: PitchFrame[] = [];

  for (const segment of pitches) {
    for (const pitch of segment) {
      frames.push({ time, rms: 0.08, pitch });
      time += 0.04;
    }
  }

  return frames;
}

describe('Mandarin tone assessment', () => {
  it('extracts numbered tones and neutral syllables', () => {
    expect(expectedToneSyllables('ni3 you3 Han4 yu3 lao3 shi1 ma?')).toEqual([
      { text: 'ni', tone: 3 },
      { text: 'you', tone: 3 },
      { text: 'han', tone: 4 },
      { text: 'yu', tone: 3 },
      { text: 'lao', tone: 3 },
      { text: 'shi', tone: 1 },
      { text: 'ma', tone: 5 },
    ]);
  });

  it('extracts accented tones while ignoring names', () => {
    expect(expectedToneSyllables('Mary duō dà?')).toEqual([
      { text: 'duo', tone: 1 },
      { text: 'da', tone: 4 },
    ]);
  });

  it('grades clear level, rising, dipping, and falling contours', () => {
    const result = assessToneContours(
      'ma1 ma2 ma3 ma4',
      framesFor([
        [210, 211, 209, 210, 211],
        [170, 178, 188, 198, 210],
        [190, 170, 148, 166, 186],
        [230, 215, 195, 174, 155],
      ]),
    );

    expect(result.status).toBe('matched');
    expect(result.score).toBeGreaterThanOrEqual(78);
    expect(result.syllables.map((item) => item.status)).toEqual(['matched', 'matched', 'matched', 'matched']);
  });

  it('scores every syllable when a fast phrase ends before the capture limit', () => {
    const spoken = framesFor([
      [210, 211, 209, 210, 211],
      [170, 178, 188, 198, 210],
      [190, 170, 148, 166, 186],
      [230, 215, 195, 174, 155],
    ]).map((frame) => ({ ...frame, time: frame.time + 0.8 }));
    const capture = [
      { time: 0, rms: 0.003, pitch: null },
      { time: 0.4, rms: 0.003, pitch: null },
      ...spoken,
      { time: 2.4, rms: 0.003, pitch: null },
    ];

    const result = assessToneContours('ma1 ma2 ma3 ma4', assessmentWindow(capture));
    expect(result.syllables.map((item) => item.status)).toEqual(['matched', 'matched', 'matched', 'matched']);
  });

  it('reports missed tones for reversed contours', () => {
    const result = assessToneContours(
      'ma2 ma4',
      framesFor([
        [220, 205, 190, 175, 160],
        [155, 170, 188, 205, 220],
      ]),
    );

    expect(result.status).toBe('missed');
    expect(result.syllables.map((item) => item.status)).toEqual(['missed', 'missed']);
  });

  it('keeps silent gaps in their time slot instead of shifting later syllables forward', () => {
    const result = assessToneContours('ma1 ma2 ma4', [
      { time: 0, rms: 0.08, pitch: 210 },
      { time: 0.04, rms: 0.08, pitch: 211 },
      { time: 0.08, rms: 0.08, pitch: 209 },
      { time: 0.12, rms: 0.08, pitch: 210 },
      { time: 0.4, rms: 0.002, pitch: null },
      { time: 0.44, rms: 0.002, pitch: null },
      { time: 0.48, rms: 0.002, pitch: null },
      { time: 0.8, rms: 0.08, pitch: 230 },
      { time: 0.84, rms: 0.08, pitch: 215 },
      { time: 0.88, rms: 0.08, pitch: 195 },
      { time: 0.92, rms: 0.08, pitch: 174 },
      { time: 0.96, rms: 0.08, pitch: 155 },
    ]);

    expect(result.syllables.map((item) => item.status)).toEqual(['matched', 'missed', 'matched']);
  });

  it('marks future syllables pending during live assessment', () => {
    const result = assessToneContours(
      'ma1 ma2 ma4',
      [
        { time: 0, rms: 0.08, pitch: 210 },
        { time: 0.04, rms: 0.08, pitch: 211 },
        { time: 0.08, rms: 0.08, pitch: 209 },
        { time: 0.12, rms: 0.08, pitch: 210 },
      ],
      { durationSeconds: 3, live: true },
    );

    expect(result.syllables.map((item) => item.status)).toEqual(['matched', 'pending', 'pending']);
  });

  it('returns no speech when there are no voiced pitch frames', () => {
    const result = assessToneContours('wo3 xiang3 he1 cha2', [
      { time: 0, rms: 0.002, pitch: null },
      { time: 0.04, rms: 0.003, pitch: null },
    ]);

    expect(result.status).toBe('no_speech');
    expect(result.score).toBe(0);
  });

  it('detects the pitch of a simple sine wave', () => {
    const sampleRate = 48_000;
    const samples = new Float32Array(2048);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.4;
    }

    expect(detectPitchFromTimeDomain(samples, sampleRate)).toBeCloseTo(220, -1);
  });
});

// The interim "experimental" affordance is driven entirely by this single
// co-located source of truth so it can be removed in one place once the feedback
// is validated. These assertions fail loudly if the flag is flipped off without
// also revisiting the practice-UI marker it controls.
describe('tone-feedback experimental marker (interim, unvalidated)', () => {
  it('is flagged experimental until human-corpus calibration lands', () => {
    expect(TONE_FEEDBACK_EXPERIMENTAL).toBe(true);
  });

  it('exposes a non-empty label for the practice-UI badge', () => {
    expect(TONE_FEEDBACK_EXPERIMENTAL_LABEL.trim().length).toBeGreaterThan(0);
  });

  it('explains honestly why tone feedback is unvalidated', () => {
    expect(TONE_FEEDBACK_EXPERIMENTAL_HINT).toMatch(/not yet been validated/i);
    expect(TONE_FEEDBACK_EXPERIMENTAL_HINT).toMatch(/pitch detector/i);
  });
});

// While tone feedback is unvalidated, the user-facing summary must stay
// qualitative: no percentages, no frame counts, no "score" vocabulary that
// could read as a validated measurement.
describe('describeToneAssessment (qualitative, hedged copy)', () => {
  const statuses: ToneStatus[] = ['matched', 'close', 'missed', 'no_speech'];

  function syllable(tone: number | null, status: ToneSyllableResult['status'] = 'matched'): ToneSyllableResult {
    return { text: 'ma', tone, observed: 'level', score: 0, status, startHz: null, endHz: null };
  }

  function assessment(status: ToneStatus, voicedFrameCount = 40, tones: (number | null)[] = [1, 3]): ToneAssessmentResult {
    return { status, score: 50, voicedFrameCount, syllables: tones.map((tone) => syllable(tone)) };
  }

  it('never makes numeric or score-like claims for any status or evidence level', () => {
    const cases = [
      ...statuses.map((status) => assessment(status)),
      assessment('close', 2),
      assessment('close', 40, [5, 5]),
      assessment('close', 40, []),
    ];
    for (const item of cases) {
      // Both hedged (experimental) and post-validation (flag off) copy must
      // stay free of numeric and score-like claims.
      for (const experimental of [true, false]) {
        const text = describeToneAssessment(item, experimental);
        expect(text).not.toMatch(/\d/);
        expect(text).not.toMatch(/score/i);
        expect(text).not.toMatch(/frame/i);
        expect(text).not.toMatch(/%/);
      }
    }
  });

  it('hedges every tone-contour verdict as an experimental estimate while the flag is on', () => {
    for (const status of ['matched', 'close', 'missed'] as const) {
      const text = describeToneAssessment(assessment(status));
      expect(text).toMatch(/experimental estimate/i);
      expect(text).toMatch(/trust your own ear/i);
    }
  });

  it('drops the experimental hedge when the single-source flag is off', () => {
    for (const status of ['matched', 'close', 'missed'] as const) {
      const text = describeToneAssessment(assessment(status), false);
      expect(text).not.toMatch(/experimental/i);
      expect(text).toMatch(/pitch contours/i);
    }
  });

  it('distinguishes the verdicts qualitatively', () => {
    expect(describeToneAssessment(assessment('matched'))).toMatch(/sound close to the expected tones/i);
    expect(describeToneAssessment(assessment('close'))).toMatch(/may be drifting/i);
    expect(describeToneAssessment(assessment('missed'))).toMatch(/sounded different/i);
  });

  it('gives actionable guidance instead of a verdict when no speech was voiced', () => {
    const text = describeToneAssessment(assessment('no_speech', 0));
    expect(text).toMatch(/no voiced speech/i);
    expect(text).toMatch(/try again/i);
  });

  it("reports insufficient audio instead of inventing a drift verdict for the below-threshold 'close' sentinel", () => {
    const text = describeToneAssessment(assessment('close', MIN_GRADED_VOICED_FRAMES - 1));
    expect(text).toMatch(/not enough to judge/i);
    expect(text).not.toMatch(/drifting/i);
  });

  it('explains that neutral-tone-only phrases have no contour to compare', () => {
    const text = describeToneAssessment(assessment('close', 40, [5, null]));
    expect(text).toMatch(/no contour to compare/i);
    expect(text).not.toMatch(/drifting/i);
  });

  it('does not claim neutral tones when the pinyin produced no syllables at all', () => {
    const text = describeToneAssessment(assessment('close', 40, []));
    expect(text).toMatch(/could not be analyzed/i);
    expect(text).not.toMatch(/neutral tones/i);
    expect(text).not.toMatch(/drifting/i);
  });
});

describe('toneAssessmentHasVerdict', () => {
  function base(): ToneAssessmentResult {
    return {
      status: 'close',
      score: 50,
      voicedFrameCount: 40,
      syllables: [{ text: 'ma', tone: 3, observed: 'dipping', score: 0, status: 'close', startHz: null, endHz: null }],
    };
  }

  it('is true only for a real contour comparison', () => {
    expect(toneAssessmentHasVerdict(base())).toBe(true);
  });

  it('is false for no_speech, insufficient audio, and neutral-only phrases', () => {
    expect(toneAssessmentHasVerdict({ ...base(), status: 'no_speech' })).toBe(false);
    expect(toneAssessmentHasVerdict({ ...base(), voicedFrameCount: MIN_GRADED_VOICED_FRAMES - 1 })).toBe(false);
    expect(
      toneAssessmentHasVerdict({
        ...base(),
        syllables: [{ text: 'ma', tone: 5, observed: 'level', score: 0, status: 'matched', startHz: null, endHz: null }],
      }),
    ).toBe(false);
  });

  it('matches the assessor: below-threshold voiced audio yields a non-verdict sentinel', () => {
    const frames: PitchFrame[] = [
      { time: 0, rms: 0.08, pitch: 200 },
      { time: 0.04, rms: 0.08, pitch: 201 },
    ];
    const result = assessToneContours('ma1 ma2', frames);
    expect(result.status).toBe('close');
    expect(toneAssessmentHasVerdict(result)).toBe(false);
    expect(describeToneAssessment(result)).toMatch(/not enough to judge/i);
  });
});
