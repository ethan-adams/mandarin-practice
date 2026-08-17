import { describe, expect, it } from 'vitest';
import { courseSections, unitProgress } from './course';
import { addDays, defaultCardState, type CardState } from './srs';
import type { Card, DeckUnit } from './deck';

const card = (id: string, lessonId: string): Card => ({
  id,
  lessonId,
  promptEn: `prompt ${id}`,
  answerZh: '你好。',
  pinyin: 'ni3 hao3.',
  speechPhonemes: 'ni3hao3.',
});

const state = (overrides: Partial<CardState>): CardState => ({ ...defaultCardState(), ...overrides });

describe('courseSections without deck metadata (heuristic fallback)', () => {
  it('groups by lessonId into HSK level, tutor, and review sections in order', () => {
    const cards = [
      card('r1', 'Review_expanded'),
      card('t2', 'Tutor_260613'),
      card('h2', 'HSK1_02_Numbers_Time'),
      card('k1', 'HSK2_01_Family_People'),
      card('t1', 'Tutor_260525'),
      card('h1', 'HSK1_01_Greetings'),
      card('t1b', 'Tutor_260525'),
    ];
    const sections = courseSections(cards, null);
    expect(sections.map((section) => section.id)).toEqual(['hsk1', 'hsk2', 'tutor', 'review']);
    expect(sections[0].units.map((unit) => unit.meta.id)).toEqual(['HSK1_01_Greetings', 'HSK1_02_Numbers_Time']);
    expect(sections[1].title).toBe('HSK 2');
    expect(sections[2].units.map((unit) => unit.meta.id)).toEqual(['Tutor_260525', 'Tutor_260613']);
    expect(sections[2].units[0].cards).toHaveLength(2);
  });
});

describe('courseSections with deck metadata', () => {
  const deckUnits: DeckUnit[] = [
    {
      id: 'hsk1',
      title: 'HSK 1',
      order: 1,
      lessons: [
        { id: 'HSK1_01_Greetings', title: 'Greetings & Introductions', order: 1 },
        { id: 'HSK1_09_Future', title: 'Future Lesson With No Cards Yet', order: 9 },
      ],
    },
    {
      id: 'tutor',
      title: 'Tutor Lessons',
      order: 100,
      lessons: [
        // Tutor lessons ship raw ids as titles; the friendly mapping must win.
        { id: 'Tutor_260525', title: 'Tutor_260525', order: 1 },
      ],
    },
  ];

  it('uses deck unit ordering and titles, falling back to friendly names for raw-id titles', () => {
    const cards = [card('h1', 'HSK1_01_Greetings'), card('t1', 'Tutor_260525')];
    const sections = courseSections(cards, deckUnits);
    expect(sections.map((section) => section.id)).toEqual(['hsk1', 'tutor']);
    expect(sections[0].units[0].meta.title).toBe('Greetings & Introductions');
    expect(sections[0].units[0].meta.kicker).toBe('HSK 1 · Unit 1');
    expect(sections[1].units[0].meta.title).toBe('May 25');
  });

  it('tolerates malformed metadata: duplicate lesson ids collapse and missing orders never render undefined', () => {
    const messy: DeckUnit[] = [
      {
        id: 'hsk1',
        title: 'HSK 1',
        order: 1,
        lessons: [
          { id: 'HSK1_01_Greetings', title: 'Greetings & Introductions', order: 1 },
          { id: 'HSK1_01_Greetings', title: 'Duplicate Entry', order: 2 },
          { id: 'HSK1_02_Numbers_Time', title: 'Numbers & Time', order: undefined as unknown as number },
        ],
      },
    ];
    const cards = [card('h1', 'HSK1_01_Greetings'), card('h2', 'HSK1_02_Numbers_Time')];
    const sections = courseSections(cards, messy);
    const units = sections[0].units;
    expect(units.map((unit) => unit.meta.id)).toEqual(['HSK1_02_Numbers_Time', 'HSK1_01_Greetings']);
    for (const unit of units) {
      expect(unit.meta.kicker).not.toContain('undefined');
    }
  });

  it('skips metadata lessons with no cards and keeps unlisted lessons reachable', () => {
    const cards = [card('h1', 'HSK1_01_Greetings'), card('x1', 'Tutor_260701')];
    const sections = courseSections(cards, deckUnits);
    expect(sections.flatMap((section) => section.units.map((unit) => unit.meta.id))).toEqual([
      'HSK1_01_Greetings',
      'Tutor_260701',
    ]);
    // The empty future lesson is not rendered; the unlisted lesson gets a section.
    expect(sections.some((section) => section.id.startsWith('extra-'))).toBe(true);
  });
});

describe('unitProgress', () => {
  it('derives seen/mastered/due/fresh from review state only', () => {
    const cards = [card('a', 'L'), card('b', 'L'), card('c', 'L'), card('d', 'L')];
    const reviewState = {
      // mastered: interval a week out, not due yet
      a: state({ attempts: 6, intervalDays: 14, due: addDays(10) }),
      // seen and due today
      b: state({ attempts: 2, intervalDays: 1, due: addDays(0) }),
      // seen, scheduled for later, below mastery interval
      c: state({ attempts: 1, intervalDays: 2, due: addDays(2) }),
      // d: never seen
    };
    expect(unitProgress(cards, reviewState)).toEqual({ total: 4, seen: 3, mastered: 1, due: 1, fresh: 1 });
  });

  it('counts an attempts:0 record as fresh, not seen', () => {
    const cards = [card('a', 'L')];
    expect(unitProgress(cards, { a: state({}) })).toEqual({ total: 1, seen: 0, mastered: 0, due: 0, fresh: 1 });
  });

  it('reads partial legacy entries defensively instead of misclassifying them', () => {
    const cards = [card('a', 'L'), card('b', 'L')];
    const partial = { a: {} as CardState, b: { attempts: 3 } as CardState };
    // a: no attempts field -> fresh; b: attempts but no due/interval -> seen, due now, not mastered.
    expect(unitProgress(cards, partial)).toEqual({ total: 2, seen: 1, mastered: 0, due: 1, fresh: 1 });
  });
});
