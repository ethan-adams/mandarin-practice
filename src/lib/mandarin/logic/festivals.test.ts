import { describe, expect, it } from 'vitest';
import { FESTIVALS, festivalWhen, upcomingFestival } from './festivals';

describe('FESTIVALS data', () => {
  it('only lists festivals with at least one real date', () => {
    for (const f of FESTIVALS) {
      expect(Object.keys(f.dates).length).toBeGreaterThan(0);
      for (const d of Object.values(f.dates)) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('upcomingFestival', () => {
  it('surfaces the nearest festival within the window', () => {
    // From 2026-08-22, Mid-Autumn (2026-09-25) is the next one.
    const up = upcomingFestival('2026-08-22', 45)!;
    expect(up.festival.id).toBe('mid-autumn');
    expect(up.dateIso).toBe('2026-09-25');
    expect(up.daysUntil).toBe(34);
  });

  it('returns null when nothing falls inside the window', () => {
    // Late October 2026: Double Ninth (Oct 18) has passed; next is 2027.
    expect(upcomingFestival('2026-10-25', 30)).toBeNull();
  });

  it('counts a festival happening today as upcoming (0 days)', () => {
    const up = upcomingFestival('2026-09-25', 45)!;
    expect(up.festival.id).toBe('mid-autumn');
    expect(up.daysUntil).toBe(0);
  });

  it('crosses the year boundary to find the next Spring Festival', () => {
    const up = upcomingFestival('2027-01-20', 30)!;
    expect(up.festival.id).toBe('spring');
    expect(up.dateIso).toBe('2027-02-06');
  });

  it('never returns a past festival', () => {
    // Two days after Mid-Autumn, it should not resurface.
    const up = upcomingFestival('2026-09-27', 45);
    expect(up?.festival.id).not.toBe('mid-autumn');
  });
});

describe('festivalWhen', () => {
  it('phrases the countdown by proximity', () => {
    expect(festivalWhen(0)).toBe('Today');
    expect(festivalWhen(1)).toBe('Tomorrow');
    expect(festivalWhen(5)).toBe('in 5 days');
    expect(festivalWhen(34)).toBe('in about 5 weeks');
  });
});
