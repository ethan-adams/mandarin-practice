// Cultural festivals — the "motivation through culture, not gamification" pillar
// (VISION.md). Most Chinese festivals follow the lunisolar calendar, so their
// Gregorian dates shift every year and can't be computed from a simple rule
// here. This is therefore a CURATED table of verified dates (sources checked
// 2026-08-22: chinahighlights.com, travelchinaguide.com, studycli.org). Extend
// the `dates` maps as new years are confirmed; the app only ever surfaces a
// festival it has a real date for. Honest by construction — no guessed dates.

import { today } from './srs';

export type FestivalGreeting = { hanzi: string; pinyin: string; gloss: string };

export type Festival = {
  id: string;
  hanzi: string;
  pinyin: string;
  english: string;
  /** One or two calm sentences of real cultural context. */
  blurb: string;
  greeting?: FestivalGreeting;
  /** Verified Gregorian date per year, as 'YYYY-MM-DD'. */
  dates: Record<number, string>;
};

export type UpcomingFestival = {
  festival: Festival;
  dateIso: string;
  daysUntil: number;
};

// Curated set of the major festivals. Dates verified for 2026–2028 where known;
// only listed years are ever shown.
export const FESTIVALS: Festival[] = [
  {
    id: 'spring',
    hanzi: '春节',
    pinyin: 'Chūnjié',
    english: 'Spring Festival',
    blurb: 'The lunar new year — family reunions, red couplets on the doors, and fireworks to see off the old year.',
    greeting: { hanzi: '新年快乐', pinyin: 'Xīnnián kuàilè', gloss: 'Happy New Year' },
    dates: { 2026: '2026-02-17', 2027: '2027-02-06', 2028: '2028-01-26' },
  },
  {
    id: 'lantern',
    hanzi: '元宵节',
    pinyin: 'Yuánxiāo Jié',
    english: 'Lantern Festival',
    blurb: 'The first full moon of the new year, marked with glowing lanterns, riddles, and sweet tangyuan.',
    greeting: { hanzi: '元宵快乐', pinyin: 'Yuánxiāo kuàilè', gloss: 'Happy Lantern Festival' },
    dates: { 2026: '2026-03-03', 2027: '2027-02-20' },
  },
  {
    id: 'qingming',
    hanzi: '清明节',
    pinyin: 'Qīngmíng Jié',
    english: 'Qingming (Tomb-Sweeping Day)',
    blurb: 'Families tend their ancestors’ graves and step out into the fresh spring — remembrance and renewal together.',
    dates: { 2026: '2026-04-05', 2027: '2027-04-05', 2028: '2028-04-04' },
  },
  {
    id: 'dragon-boat',
    hanzi: '端午节',
    pinyin: 'Duānwǔ Jié',
    english: 'Dragon Boat Festival',
    blurb: 'Dragon-boat races and sticky-rice zongzi, honoring the poet Qu Yuan on the fifth day of the fifth month.',
    greeting: { hanzi: '端午安康', pinyin: 'Duānwǔ ānkāng', gloss: 'wishing you peace and health' },
    dates: { 2026: '2026-06-19', 2027: '2027-06-09', 2028: '2028-05-28' },
  },
  {
    id: 'qixi',
    hanzi: '七夕',
    pinyin: 'Qīxī',
    english: 'Qixi (Double Seventh)',
    blurb: 'China’s romantic festival — the one night a year the cowherd and the weaver-girl stars are said to meet.',
    dates: { 2026: '2026-08-13', 2027: '2027-08-08' },
  },
  {
    id: 'mid-autumn',
    hanzi: '中秋节',
    pinyin: 'Zhōngqiū Jié',
    english: 'Mid-Autumn Festival',
    blurb: 'The harvest full moon — mooncakes and lanterns, and gathering with family under the brightest moon of the year.',
    greeting: { hanzi: '中秋快乐', pinyin: 'Zhōngqiū kuàilè', gloss: 'Happy Mid-Autumn' },
    dates: { 2026: '2026-09-25', 2027: '2027-09-15', 2028: '2028-10-03' },
  },
  {
    id: 'national-day',
    hanzi: '国庆节',
    pinyin: 'Guóqìng Jié',
    english: 'National Day',
    blurb: 'The founding of the People’s Republic, and the start of a week-long autumn holiday across the country.',
    dates: { 2026: '2026-10-01', 2027: '2027-10-01', 2028: '2028-10-01' },
  },
  {
    id: 'double-ninth',
    hanzi: '重阳节',
    pinyin: 'Chóngyáng Jié',
    english: 'Double Ninth Festival',
    blurb: 'Climbing to high places and honoring elders on the ninth day of the ninth month.',
    dates: { 2026: '2026-10-18', 2027: '2027-10-08' },
  },
];

const MS_PER_DAY = 86_400_000;

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / MS_PER_DAY);
}

/**
 * The single nearest festival landing on or after `todayIso` and within
 * `windowDays`, or null when none is in range. Scans every listed year so a
 * December "today" can still surface next January's Spring Festival.
 */
export function upcomingFestival(todayIso: string = today(), windowDays = 45): UpcomingFestival | null {
  let best: UpcomingFestival | null = null;
  for (const festival of FESTIVALS) {
    for (const dateIso of Object.values(festival.dates)) {
      const daysUntil = daysBetween(todayIso, dateIso);
      if (daysUntil < 0 || daysUntil > windowDays) continue;
      if (!best || daysUntil < best.daysUntil) best = { festival, dateIso, daysUntil };
    }
  }
  return best;
}

/** Human "when" label: Today / Tomorrow / in N days / in about N weeks. */
export function festivalWhen(daysUntil: number): string {
  if (daysUntil <= 0) return 'Today';
  if (daysUntil === 1) return 'Tomorrow';
  if (daysUntil <= 14) return `in ${daysUntil} days`;
  const weeks = Math.round(daysUntil / 7);
  return `in about ${weeks} weeks`;
}
