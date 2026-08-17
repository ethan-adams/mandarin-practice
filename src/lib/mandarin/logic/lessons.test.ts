import { describe, expect, it } from 'vitest';
import { lessonLabel, lessonMeta } from './lessons';

// A learner must never see raw internal lesson ids like Tutor_260525 rendered
// verbatim; they map to friendly titles instead.

describe('lessonMeta', () => {
  it('maps HSK lessons of any level to themed unit names with unit numbers', () => {
    expect(lessonMeta('HSK1_01_Greetings')).toMatchObject({
      title: 'Greetings',
      kicker: 'HSK 1 · Unit 1',
      group: 'hsk',
      level: 1,
      order: 1,
    });
    expect(lessonMeta('HSK1_02_Numbers_Time').title).toBe('Numbers & Time');
    expect(lessonMeta('HSK1_05_Places_Movement').title).toBe('Places & Movement');
    expect(lessonMeta('HSK1_06_Daily_Actions').title).toBe('Daily Actions');
    expect(lessonMeta('HSK2_04_Transport_Travel')).toMatchObject({
      title: 'Transport & Travel',
      kicker: 'HSK 2 · Unit 4',
      group: 'hsk',
      level: 2,
      order: 4,
    });
  });

  it('maps tutor lessons to friendly dates, never exposing the raw id', () => {
    const meta = lessonMeta('Tutor_260525');
    expect(meta).toMatchObject({ title: 'May 25', kicker: 'Tutor lesson', group: 'tutor' });
    expect(meta.title).not.toContain('Tutor');
  });

  it('disambiguates suffixed tutor lessons and keeps them ordered after the base date', () => {
    const suffixed = lessonMeta('Tutor_260608-1');
    expect(suffixed.title).toBe('Jun 8 (1)');
    expect(suffixed.order).toBeGreaterThan(lessonMeta('Tutor_260606').order);
    expect(suffixed.order).toBeLessThan(lessonMeta('Tutor_260613').order);
  });

  it('treats demo lessons like tutor lessons so the fallback deck stays friendly', () => {
    expect(lessonMeta('Demo_260620')).toMatchObject({ title: 'Jun 20', group: 'tutor' });
  });

  it('labels the generated review deck honestly', () => {
    expect(lessonMeta('Review_expanded')).toMatchObject({
      title: 'Mixed review',
      kicker: 'Generated practice',
      group: 'review',
    });
  });

  it('falls back to a readable name for unknown ids', () => {
    expect(lessonMeta('Some_Future_Pack')).toMatchObject({ title: 'Some Future Pack', group: 'other' });
  });

  it('genericizes personal-prefixed ids that miss the strict tutor pattern', () => {
    // A future variant id must never render its personal prefix raw.
    expect(lessonMeta('Tutor_260715_review').title).toBe('260715 review');
    expect(lessonMeta('Tutor_260715_review').kicker).toBe('Tutor lesson');
    expect(lessonMeta('Demo_extras').title).toBe('extras');
    for (const id of ['Tutor_260715_review', 'Tutor_26071', 'Tutor_260715a', 'Demo_extras']) {
      expect(lessonMeta(id).title).not.toMatch(/Tutor|Demo/);
    }
  });

  it('lessonLabel returns the short title', () => {
    expect(lessonLabel('HSK1_03_Family')).toBe('Family');
  });
});
