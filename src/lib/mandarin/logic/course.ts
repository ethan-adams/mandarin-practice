// Course structure: group the deck's lessons into ordered sections/units and
// derive per-unit progress from the user's own SRS review state. When the
// deck ships course metadata (top-level units array) it is authoritative;
// otherwise units are inferred from lessonId patterns. Progress numbers are
// honest by construction - they only reflect the learner's manual ratings
// (attempts, streaks, intervals), never unvalidated automatic assessment.

import type { Card, DeckUnit } from './deck';
import { isDue, type CardState } from './srs';
import { lessonMeta, type LessonMeta } from './lessons';

export type CourseUnit = {
  meta: Pick<LessonMeta, 'id' | 'title' | 'kicker' | 'order'>;
  cards: Card[];
};

export type CourseSection = {
  id: string;
  title: string;
  compact: boolean;
  units: CourseUnit[];
};

export type UnitProgress = {
  total: number;
  /** Cards rated at least once. */
  seen: number;
  /** Cards scheduled a week or more out - survived repeated correct ratings. */
  mastered: number;
  /** Seen cards whose review is due now. */
  due: number;
  /** Never-seen cards. */
  fresh: number;
};

const GROUP_ORDER = { hsk: 0, tutor: 1, other: 2, review: 3 } as const;

function cardsByLesson(cards: Card[]) {
  const byLesson = new Map<string, Card[]>();
  for (const card of cards) {
    const bucket = byLesson.get(card.lessonId);
    if (bucket) bucket.push(card);
    else byLesson.set(card.lessonId, [card]);
  }
  return byLesson;
}

/**
 * Deck metadata is authoritative except raw-id titles (tutor lessons ship
 * title === id), which fall back to the friendly local mapping.
 */
function metaFromDeck(unit: DeckUnit, lesson: DeckUnit['lessons'][number]): CourseUnit['meta'] {
  const fallback = lessonMeta(lesson.id);
  const title = lesson.title && lesson.title !== lesson.id ? lesson.title : fallback.title;
  // Metadata is external input: a missing/non-numeric order must not render
  // "Unit undefined".
  const order = typeof lesson.order === 'number' && Number.isFinite(lesson.order) ? lesson.order : 0;
  const kicker = unit.id.toLowerCase().startsWith('hsk') && order > 0 ? `${unit.title} · Unit ${order}` : fallback.kicker;
  return { id: lesson.id, title, kicker, order };
}

function heuristicSections(byLesson: Map<string, Card[]>): CourseSection[] {
  const units = [...byLesson.entries()]
    .map(([lessonId, lessonCards]) => ({ meta: lessonMeta(lessonId), cards: lessonCards }))
    .sort(
      (a, b) =>
        GROUP_ORDER[a.meta.group] - GROUP_ORDER[b.meta.group] ||
        a.meta.level - b.meta.level ||
        a.meta.order - b.meta.order ||
        a.meta.id.localeCompare(b.meta.id),
    );

  const sections: CourseSection[] = [];
  for (const unit of units) {
    const sectionId = unit.meta.group === 'hsk' ? `hsk${unit.meta.level}` : unit.meta.group === 'review' ? 'review' : 'tutor';
    const title = unit.meta.group === 'hsk' ? `HSK ${unit.meta.level}` : unit.meta.group === 'review' ? 'Review' : 'Tutor lessons';
    let section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) {
      section = { id: sectionId, title, compact: sectionId === 'tutor', units: [] };
      sections.push(section);
    }
    section.units.push(unit);
  }
  return sections;
}

export function courseSections(cards: Card[], deckUnits: DeckUnit[] | null = null): CourseSection[] {
  const byLesson = cardsByLesson(cards);
  if (!deckUnits) return heuristicSections(byLesson);

  const listed = new Set<string>();
  for (const unit of deckUnits) for (const lesson of unit.lessons) listed.add(lesson.id);

  // Dedupe: a lesson id repeated in the metadata (same or another unit) would
  // collide keyed-each keys in the course view. First occurrence wins.
  const rendered = new Set<string>();
  const sections: CourseSection[] = [...deckUnits]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((unit) => ({
      id: unit.id,
      title: unit.title,
      compact: !unit.id.toLowerCase().startsWith('hsk'),
      units: [...unit.lessons]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .filter((lesson) => {
          if (rendered.has(lesson.id) || (byLesson.get(lesson.id)?.length ?? 0) === 0) return false;
          rendered.add(lesson.id);
          return true;
        })
        .map((lesson) => ({ meta: metaFromDeck(unit, lesson), cards: byLesson.get(lesson.id)! })),
    }))
    .filter((section) => section.units.length > 0);

  // Lessons present in the deck but missing from the metadata still get a
  // home, so no cards become unreachable from the course view.
  const unlisted = new Map([...byLesson.entries()].filter(([lessonId]) => !listed.has(lessonId)));
  if (unlisted.size) {
    sections.push(...heuristicSections(unlisted).map((section) => ({ ...section, id: `extra-${section.id}` })));
  }
  return sections;
}

export function unitProgress(cards: Card[], reviewState: Record<string, CardState>): UnitProgress {
  const progress: UnitProgress = { total: cards.length, seen: 0, mastered: 0, due: 0, fresh: 0 };
  for (const card of cards) {
    // Stored entries may be partial (legacy payloads): read defensively,
    // matching the defaultCardState-merge semantics used everywhere else.
    const state = reviewState[card.id];
    const attempts = state?.attempts ?? 0;
    if (!state || attempts === 0) {
      progress.fresh += 1;
      continue;
    }
    progress.seen += 1;
    if ((state.intervalDays ?? 0) >= 7) progress.mastered += 1;
    if (isDue(state)) progress.due += 1;
  }
  return progress;
}
