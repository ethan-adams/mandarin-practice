import { describe, expect, it } from 'vitest';
import {
  CONTOUR_POINTS,
  compareContours,
  contourFromFrames,
  resampleSeries,
  toSemitoneContour,
} from './mandarinToneReference';

const ramp = (from: number, to: number, n = CONTOUR_POINTS) =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

describe('resampleSeries', () => {
  it('stretches a short series to n points, preserving endpoints', () => {
    const out = resampleSeries([0, 10], 5);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(0);
    expect(out[4]).toBe(10);
    expect(out[2]).toBeCloseTo(5, 5);
  });
});

describe('toSemitoneContour', () => {
  it('centers on the median and returns fixed length', () => {
    const contour = toSemitoneContour([100, 200, 400], 24);
    expect(contour).not.toBeNull();
    expect(contour).toHaveLength(24);
  });

  it('returns null when there is not enough voiced pitch', () => {
    expect(toSemitoneContour([220], 24)).toBeNull();
    expect(toSemitoneContour([], 24)).toBeNull();
  });
});

describe('contourFromFrames', () => {
  it('uses only voiced frames', () => {
    const frames = [
      { time: 0, pitch: null },
      { time: 0.04, pitch: 180 },
      { time: 0.08, pitch: 200 },
      { time: 0.12, pitch: 240 },
      { time: 0.16, pitch: null },
    ];
    expect(contourFromFrames(frames)).not.toBeNull();
  });

  it('is null when nothing is voiced', () => {
    expect(contourFromFrames([{ time: 0, pitch: null }, { time: 0.04, pitch: null }])).toBeNull();
  });
});

describe('compareContours', () => {
  it('matches a rising tone against a rising reference', () => {
    const result = compareContours(ramp(-6, 6), ramp(-5, 5.5));
    expect(result?.status).toBe('matched');
    expect(result!.similarity).toBeGreaterThan(0.7);
  });

  it('misses a falling attempt against a rising reference', () => {
    const result = compareContours(ramp(6, -6), ramp(-6, 6));
    expect(result?.status).toBe('missed');
    expect(result!.correlation).toBeLessThan(0);
  });

  it('matches a level tone (flat) against a flat reference', () => {
    const flatRef = Array(CONTOUR_POINTS).fill(0);
    const flatUser = Array.from({ length: CONTOUR_POINTS }, (_, i) => (i % 2 ? 0.2 : -0.2));
    expect(compareContours(flatUser, flatRef)?.status).toBe('matched');
  });

  it('misses a big pitch swing against a flat reference', () => {
    const flatRef = Array(CONTOUR_POINTS).fill(0);
    const swing = Array.from({ length: CONTOUR_POINTS }, (_, i) => 5 * Math.sin((i / CONTOUR_POINTS) * Math.PI * 2));
    expect(compareContours(swing, flatRef)?.status).toBe('missed');
  });

  it('matches a falling tone against a falling reference', () => {
    expect(compareContours(ramp(6, -6), ramp(5, -5))?.status).toBe('matched');
  });

  it('returns null on missing input', () => {
    expect(compareContours(null, ramp(0, 4))).toBeNull();
    expect(compareContours(ramp(0, 4), null)).toBeNull();
  });
});
