// Reference-contour pronunciation scoring (see VISION.md "Pronunciation").
//
// Instead of scoring a spoken syllable against an idealized mathematical tone
// shape, we compare the learner's pitch *contour* to the pitch contour of the
// native reference clip they just heard (the prebuilt audio). Contours are
// normalized to semitones relative to their own median, so the comparison is
// about pitch SHAPE (the tone melody) and is independent of speaker pitch,
// gender, or microphone gain.
//
// This module is pure and framework-free so it is unit-testable and can run in
// the browser. The reference contours are extracted offline (factory
// scripts/gen_contours.py) and shipped as public/mandarin-contours.json.

export type ContourFrame = { time: number; pitch: number | null; rms?: number };

/** A contour is a fixed-length series of semitones relative to its own median. */
export const CONTOUR_POINTS = 24;

/** Linearly resample a numeric series to exactly `n` points. */
export function resampleSeries(series: number[], n: number): number[] {
  if (series.length === 0) return [];
  if (series.length === 1) return Array(n).fill(series[0]);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const pos = (i / (n - 1)) * (series.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, series.length - 1);
    const frac = pos - lo;
    out.push(series[lo] * (1 - frac) + series[hi] * frac);
  }
  return out;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Hz series -> semitones relative to the series' median pitch. */
export function toSemitoneContour(pitchesHz: number[], points = CONTOUR_POINTS): number[] | null {
  const voiced = pitchesHz.filter((hz) => Number.isFinite(hz) && hz > 0);
  if (voiced.length < 3) return null;
  const med = median(voiced);
  if (med <= 0) return null;
  const semis = voiced.map((hz) => 12 * Math.log2(hz / med));
  return resampleSeries(semis, points);
}

/** Build a comparable contour from captured mic frames (voiced frames only). */
export function contourFromFrames(frames: ContourFrame[], points = CONTOUR_POINTS): number[] | null {
  const pitches = frames
    .filter((frame) => frame.pitch != null && Number.isFinite(frame.pitch) && (frame.pitch as number) > 0)
    .map((frame) => frame.pitch as number);
  return toSemitoneContour(pitches, points);
}

function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i += 1) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  if (da === 0 || db === 0) return 0;
  return num / Math.sqrt(da * db);
}

export type ContourComparison = {
  /** 0..1, higher is a closer match of the pitch shape. */
  similarity: number;
  /** Shape-correlation of the two contours, -1..1. */
  correlation: number;
  status: 'matched' | 'close' | 'missed';
};

/**
 * Compare a learner contour to a reference contour. Correlation captures whether
 * the pitch moved the same way (the tone melody); a small range penalty keeps a
 * near-flat mumble from correlating its way to a false match.
 */
export function compareContours(user: number[] | null, reference: number[] | null): ContourComparison | null {
  if (!user || !reference || user.length < 2 || reference.length < 2) return null;
  const n = CONTOUR_POINTS;
  const u = user.length === n ? user : resampleSeries(user, n);
  const r = reference.length === n ? reference : resampleSeries(reference, n);

  const correlation = pearson(u, r);
  const userRange = Math.max(...u) - Math.min(...u);
  const refRange = Math.max(...r) - Math.min(...r);

  // Level tone (tone 1): the reference barely moves, so correlation is
  // meaningless (a flat line has no variance). Score on how flat the learner
  // stayed instead of on shape correlation.
  const FLAT = 1.5; // semitones
  if (refRange < FLAT) {
    const status: ContourComparison['status'] = userRange < 2.5 ? 'matched' : userRange < 4 ? 'close' : 'missed';
    const similarity = Math.max(0, Math.min(1, 1 - Math.max(0, userRange - refRange) / 6));
    return { similarity, correlation, status };
  }

  // How well the learner reproduced the reference's pitch travel (0..1). A flat
  // reading of a contour tone, or an exaggerated one, is penalized gently.
  const rangeRatio = Math.min(userRange, refRange) / Math.max(userRange, refRange, 0.001);
  const shape = (correlation + 1) / 2; // 0..1
  const similarity = Math.max(0, Math.min(1, shape * 0.8 + rangeRatio * 0.2));
  const status: ContourComparison['status'] =
    correlation >= 0.55 && rangeRatio >= 0.4 ? 'matched' : correlation >= 0.2 ? 'close' : 'missed';
  return { similarity, correlation, status };
}

/**
 * Per-syllable comparison: split both contours into `syllables` equal-time
 * segments and compare each. Rough (equal-time, not force-aligned) but honest
 * and enough to point at which syllable's tone drifted.
 */
export function compareBySyllable(
  user: number[] | null,
  reference: number[] | null,
  syllables: number,
): ContourComparison[] {
  if (!user || !reference || syllables < 1) return [];
  const n = CONTOUR_POINTS;
  const u = resampleSeries(user, n);
  const r = resampleSeries(reference, n);
  const per = Math.max(2, Math.floor(n / syllables));
  const out: ContourComparison[] = [];
  for (let s = 0; s < syllables; s += 1) {
    const start = Math.floor((s * n) / syllables);
    const end = s === syllables - 1 ? n : Math.floor(((s + 1) * n) / syllables);
    const segU = resampleSeries(u.slice(start, end), per);
    const segR = resampleSeries(r.slice(start, end), per);
    const cmp = compareContours(segU, segR);
    if (cmp) out.push(cmp);
  }
  return out;
}
