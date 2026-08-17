export type ToneStatus = 'matched' | 'close' | 'missed' | 'no_speech';
export type ToneSyllableStatus = 'matched' | 'close' | 'missed' | 'pending';

export type ExpectedToneSyllable = {
  text: string;
  tone: number | null;
};

export type PitchFrame = {
  time: number;
  rms: number;
  pitch: number | null;
};

export type ToneSyllableResult = ExpectedToneSyllable & {
  observed: 'level' | 'rising' | 'dipping' | 'falling' | 'unvoiced';
  score: number;
  status: ToneSyllableStatus;
  startHz: number | null;
  endHz: number | null;
};

export type ToneAssessmentResult = {
  status: ToneStatus;
  score: number;
  voicedFrameCount: number;
  syllables: ToneSyllableResult[];
};

export type ToneAssessmentOptions = {
  durationSeconds?: number;
  live?: boolean;
};

// --- Interim tone-feedback validation status ------------------------------------
// Tone-contour verdicts here come from an in-browser pitch detector that has NOT
// yet been validated against human recordings, and on some synthetic voices it is
// prone to octave errors. Until it is calibrated against a human corpus, tone
// feedback must be presented as experimental so it is never mistaken for
// validated, authoritative scoring. Recognition and manual self-rating stay
// primary.
//
// This is the SINGLE source of the experimental affordance. Flipping this one
// flag to false removes the marker everywhere once the feedback is validated.
export const TONE_FEEDBACK_EXPERIMENTAL = true;
export const TONE_FEEDBACK_EXPERIMENTAL_LABEL = 'Experimental';
export const TONE_FEEDBACK_EXPERIMENTAL_HINT =
  'Tone estimates come from an in-browser pitch detector that has not yet been validated against human recordings.';

// Minimum usable pitch frames before a contour comparison is attempted; shared
// with assessToneContours' early return so the UI copy and the assessor agree
// on what counts as "not enough audio to judge".
export const MIN_GRADED_VOICED_FRAMES = 4;

// True only when the assessment actually compared contours: enough voiced
// audio, at least one graded (non-neutral) syllable, and a contour verdict.
// Below-threshold results reuse the 'close' status as a sentinel (see
// assessToneContours), which is guidance, not a verdict.
export function toneAssessmentHasVerdict(result: ToneAssessmentResult): boolean {
  return (
    (result.status === 'matched' || result.status === 'close' || result.status === 'missed') &&
    result.voicedFrameCount >= MIN_GRADED_VOICED_FRAMES &&
    result.syllables.some((syllable) => syllable.tone !== null && syllable.tone !== 5)
  );
}

// Qualitative, hedged summary for the practice UI. While tone feedback is
// unvalidated (TONE_FEEDBACK_EXPERIMENTAL above), the app must never surface
// the internal numeric score or frame counts as if they were facts, so this
// maps an assessment to cautious language with no numbers and no "score"
// vocabulary. The hedge is driven by the same single-source flag as the badge,
// so flipping that flag removes it here too once the feedback is validated.
export function describeToneAssessment(result: ToneAssessmentResult, experimental: boolean = TONE_FEEDBACK_EXPERIMENTAL): string {
  if (result.status === 'no_speech') {
    return 'No voiced speech was picked up — try again a little closer to the microphone.';
  }
  if (!toneAssessmentHasVerdict(result)) {
    // The assessor bailed out before comparing contours (too little voiced
    // audio, unparseable pinyin, or a neutral-tone-only phrase): say so
    // instead of inventing a verdict.
    if (!result.syllables.length) {
      return 'The tones in this phrase could not be analyzed — trust your own ear here.';
    }
    return result.syllables.some((syllable) => syllable.tone !== null && syllable.tone !== 5)
      ? 'Only a moment of voiced audio was picked up — not enough to judge tones. Try again a little closer to the microphone.'
      : 'This phrase uses neutral tones only, so there is no contour to compare — trust your own ear here.';
  }
  const verdict =
    result.status === 'matched'
      ? 'Pitch contours sound close to the expected tones'
      : result.status === 'close'
        ? 'Some pitch contours may be drifting from the expected tones'
        : 'The pitch contours sounded different from the expected tones';
  return experimental ? `${verdict} — an experimental estimate, so trust your own ear first.` : `${verdict}.`;
}

const accentedToneMap: Record<string, { plain: string; tone: number }> = {
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

const pinyinTokenPattern = /[A-Za-züÜǖǘǚǜāáǎàēéěèīíǐìōóǒòūúǔùvV:]+[1-5]?/gu;
const pitchFloorHz = 70;
const pitchCeilingHz = 500;
const minRms = 0.012;

export function expectedToneSyllables(pinyin: string): ExpectedToneSyllable[] {
  const matches = pinyin.match(pinyinTokenPattern) ?? [];
  return matches
    .map((raw) => parsePinyinToken(raw))
    .filter((item): item is ExpectedToneSyllable => Boolean(item));
}

function parsePinyinToken(raw: string): ExpectedToneSyllable | null {
  const token = raw.trim();
  if (!token) return null;

  const numbered = token.match(/^([A-Za-züÜvV:]+)([1-5])$/u);
  if (numbered) {
    return {
      text: normalizePlainPinyin(numbered[1]),
      tone: Number(numbered[2]),
    };
  }

  let tone: number | null = null;
  let text = '';
  for (const char of token) {
    const marked = accentedToneMap[char.toLowerCase()];
    if (marked) {
      tone = marked.tone;
      text += char === char.toUpperCase() ? marked.plain.toUpperCase() : marked.plain;
    } else {
      text += char;
    }
  }

  const normalizedText = normalizePlainPinyin(text);
  const isLikelyName = /^[A-Z][a-z]+$/u.test(token) && tone === null;
  const isPinyinLike = /^[a-zü]+$/u.test(normalizedText) && normalizedText.length <= 6;
  if (isLikelyName || !isPinyinLike) return null;

  return {
    text: normalizedText,
    tone: tone ?? 5,
  };
}

function normalizePlainPinyin(value: string) {
  return value.replaceAll('u:', 'ü').replaceAll('U:', 'Ü').replaceAll('v', 'ü').replaceAll('V', 'Ü').toLowerCase();
}

export function assessToneContours(pinyin: string, frames: PitchFrame[], options: ToneAssessmentOptions = {}): ToneAssessmentResult {
  const expected = expectedToneSyllables(pinyin);
  const voiced = frames.filter((frame) => isUsablePitchFrame(frame));
  const gradedExpected = expected.filter((item) => item.tone && item.tone !== 5);

  if (!expected.length || !gradedExpected.length || voiced.length < MIN_GRADED_VOICED_FRAMES) {
    return {
      status: voiced.length ? 'close' : 'no_speech',
      score: voiced.length ? 50 : 0,
      voicedFrameCount: voiced.length,
      syllables: expected.map((item, index) => (options.live ? pendingSyllableResult(item, index === 0 && voiced.length ? 'missed' : 'pending') : emptySyllableResult(item))),
    };
  }

  const syllableSegments = segmentFramesByTime(frames, expected.length, options.durationSeconds);
  const speechStart = firstUsableFrameTime(frames);
  const latestTime = Math.max(...frames.map((frame) => frame.time - speechStart), 0);
  const segmentDuration = segmentWindowSeconds(frames, expected.length, options.durationSeconds);
  const syllables = expected.map((item, index) => {
    if (options.live && segmentDuration && latestTime + 0.12 < segmentDuration * index) {
      return pendingSyllableResult(item);
    }
    return scoreSyllable(item, syllableSegments[index] ?? [], options.live && segmentDuration ? latestTime < segmentDuration * (index + 1) : false);
  });
  const scored = syllables.filter((item) => item.text && item.tone && item.tone !== 5 && item.status !== 'pending');
  const score = scored.length ? Math.round(scored.reduce((sum, item) => sum + item.score, 0) / scored.length) : 0;

  return {
    status: scored.length ? (score >= 78 ? 'matched' : score >= 58 ? 'close' : 'missed') : 'no_speech',
    score,
    voicedFrameCount: voiced.length,
    syllables,
  };
}

// KNOWN LIMITATION (documented, not fixed here): this single-pass autocorrelation
// F0 estimator is unreliable on high-pitched synthetic voices whose vowel nucleus
// is dominated by a formant-boosted 2nd harmonic (e.g. the pinned Kokoro zf_001,
// whose F0 sits ~380 Hz with real per-tone movement spanning nearly an octave that
// overlaps its own octave-error bands). On such audio it octave-errors and reads
// most tones as falling. This was verified against 9 F0 estimators (YIN/CMNDF,
// HPS, cepstrum, low-pass+YIN, DP continuity tracking, octave-anchoring, ...), none
// of which cleanly recovered tone on that voice. The cause is the signal, not the
// algorithm, so a lightweight in-browser detector cannot be tuned to fix it. The
// live tone-feedback logic is intentionally left unchanged, since a replacement
// cannot be validated against real human mic input without a human-recorded
// benchmark. Tone is therefore treated as a reported, non-authoritative metric.
export function detectPitchFromTimeDomain(samples: Float32Array, sampleRate: number): number | null {
  const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
  if (rms < minRms) return null;

  const minLag = Math.floor(sampleRate / pitchCeilingHz);
  const maxLag = Math.min(Math.floor(sampleRate / pitchFloorHz), samples.length - 1);
  let bestLag = -1;
  let bestCorrelation = 0;
  const correlations: number[] = [];

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    for (let i = 0; i < samples.length - lag; i += 1) {
      correlation += samples[i] * samples[i + lag];
      leftEnergy += samples[i] * samples[i];
      rightEnergy += samples[i + lag] * samples[i + lag];
    }

    const normalized = leftEnergy && rightEnergy ? correlation / Math.sqrt(leftEnergy * rightEnergy) : 0;
    correlations[lag] = normalized;
    if (normalized > bestCorrelation) {
      bestCorrelation = normalized;
      bestLag = lag;
    }
  }

  for (let lag = minLag + 1; lag < maxLag - 1; lag += 1) {
    const correlation = correlations[lag] ?? 0;
    if (correlation > 0.72 && correlation >= (correlations[lag - 1] ?? 0) && correlation >= (correlations[lag + 1] ?? 0)) {
      return sampleRate / lag;
    }
  }

  if (bestLag < 0 || bestCorrelation < 0.72) return null;
  return sampleRate / bestLag;
}

function isUsablePitchFrame(frame: PitchFrame) {
  return Boolean(frame.pitch && frame.pitch >= pitchFloorHz && frame.pitch <= pitchCeilingHz && frame.rms >= minRms);
}

function segmentFramesByTime(frames: PitchFrame[], count: number, durationSeconds?: number) {
  if (!count) return [];
  const segments: PitchFrame[][] = Array.from({ length: count }, () => []);
  const start = firstUsableFrameTime(frames);
  const end = lastUsableFrameTime(frames);
  const observedDuration = Math.max(end - start, 0.001);
  const duration = Math.max(durationSeconds ?? observedDuration, 0.001);

  for (const frame of frames) {
    const position = duration ? (frame.time - start) / duration : 0;
    const index = Math.min(count - 1, Math.max(0, Math.floor(position * count)));
    if (isUsablePitchFrame(frame)) segments[index].push(frame);
  }

  return segments;
}

function segmentWindowSeconds(frames: PitchFrame[], count: number, durationSeconds?: number) {
  if (!count) return 0;
  if (durationSeconds) return durationSeconds / count;
  const start = firstUsableFrameTime(frames);
  const duration = Math.max(lastUsableFrameTime(frames) - start, 0.001);
  return duration / count;
}

function firstUsableFrameTime(frames: PitchFrame[]) {
  return frames.find(isUsablePitchFrame)?.time ?? Math.min(...frames.map((frame) => frame.time), 0);
}

function lastUsableFrameTime(frames: PitchFrame[]) {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    if (isUsablePitchFrame(frames[index])) return frames[index].time;
  }
  return Math.max(...frames.map((frame) => frame.time), 0.001);
}

function scoreSyllable(expected: ExpectedToneSyllable, segment: PitchFrame[], stillActive = false): ToneSyllableResult {
  if (!expected.tone || expected.tone === 5) {
    return {
      ...expected,
      observed: segment.length ? observedContour(segment) : 'unvoiced',
      score: 100,
      status: 'matched',
      startHz: medianPitch(segment.slice(0, Math.max(1, Math.ceil(segment.length * 0.3)))),
      endHz: medianPitch(segment.slice(Math.floor(segment.length * 0.7))),
    };
  }

  if (segment.length < 3) return stillActive ? pendingSyllableResult(expected) : emptySyllableResult(expected);

  const startHz = medianPitch(segment.slice(0, Math.max(1, Math.ceil(segment.length * 0.3))));
  const middleHz = medianPitch(segment.slice(Math.floor(segment.length * 0.35), Math.max(Math.floor(segment.length * 0.65), 1)));
  const endHz = medianPitch(segment.slice(Math.floor(segment.length * 0.7)));
  const pitches = segment.map((frame) => frame.pitch).filter((pitch): pitch is number => Boolean(pitch));
  const lowHz = Math.min(...pitches);
  const highHz = Math.max(...pitches);
  const movement = startHz && endHz ? semitoneDelta(startHz, endHz) : 0;
  const range = lowHz && highHz ? Math.abs(semitoneDelta(lowHz, highHz)) : 0;
  const observed = observedContour(segment);
  const score = scoreTone(expected.tone, movement, range, startHz, middleHz, endHz, lowHz);

  return {
    ...expected,
    observed,
    score,
    status: score >= 78 ? 'matched' : score >= 58 ? 'close' : 'missed',
    startHz,
    endHz,
  };
}

function scoreTone(
  tone: number,
  movement: number,
  range: number,
  startHz: number | null,
  middleHz: number | null,
  endHz: number | null,
  lowHz: number,
) {
  if (tone === 1) return clampScore(100 - Math.max(0, range - 1.2) * 18 - Math.abs(movement) * 12);
  if (tone === 2) return clampScore(48 + movement * 18 + Math.max(0, range - 1) * 4);
  if (tone === 4) return clampScore(48 + Math.max(0, -movement) * 18 - Math.max(0, movement) * 10);

  if (tone === 3 && startHz && middleHz && endHz) {
    const dipFromStart = semitoneDelta(lowHz, startHz);
    const recovery = semitoneDelta(lowHz, endHz);
    const middleDip = semitoneDelta(middleHz, Math.max(startHz, endHz));
    return clampScore(45 + Math.max(0, dipFromStart) * 13 + Math.max(0, recovery) * 7 + Math.max(0, middleDip) * 8);
  }

  return 55;
}

function observedContour(segment: PitchFrame[]): ToneSyllableResult['observed'] {
  if (segment.length < 3) return 'unvoiced';

  const startHz = medianPitch(segment.slice(0, Math.max(1, Math.ceil(segment.length * 0.3))));
  const middleHz = medianPitch(segment.slice(Math.floor(segment.length * 0.35), Math.max(Math.floor(segment.length * 0.65), 1)));
  const endHz = medianPitch(segment.slice(Math.floor(segment.length * 0.7)));
  if (!startHz || !endHz || !middleHz) return 'unvoiced';

  const movement = semitoneDelta(startHz, endHz);
  const middleDip = semitoneDelta(middleHz, Math.max(startHz, endHz));
  if (middleDip > 1.1) return 'dipping';
  if (movement > 1.4) return 'rising';
  if (movement < -1.7) return 'falling';
  return 'level';
}

function medianPitch(frames: PitchFrame[]) {
  const values = frames.map((frame) => frame.pitch).filter((pitch): pitch is number => Boolean(pitch)).sort((a, b) => a - b);
  if (!values.length) return null;
  return values[Math.floor(values.length / 2)];
}

function semitoneDelta(fromHz: number, toHz: number) {
  return 12 * Math.log2(toHz / fromHz);
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function emptySyllableResult(expected: ExpectedToneSyllable): ToneSyllableResult {
  return {
    ...expected,
    observed: 'unvoiced',
    score: expected.tone === 5 || !expected.tone ? 100 : 0,
    status: expected.tone === 5 || !expected.tone ? 'matched' : 'missed',
    startHz: null,
    endHz: null,
  };
}

function pendingSyllableResult(expected: ExpectedToneSyllable, fallbackStatus: ToneSyllableStatus = 'pending'): ToneSyllableResult {
  return {
    ...expected,
    observed: 'unvoiced',
    score: 0,
    status: fallbackStatus,
    startHz: null,
    endHz: null,
  };
}
