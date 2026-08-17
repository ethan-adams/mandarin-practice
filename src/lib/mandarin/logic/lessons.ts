// Friendly display names for raw deck lessonIds. UI-level mapping only: a deck
// can ship its own unit metadata, and when it does that always wins. Until then
// this keeps internal ids like "Tutor_260525" or "HSK1_02_Numbers_Time" from
// being rendered raw to a learner.

export type LessonGroup = 'hsk' | 'tutor' | 'review' | 'other';

export type LessonMeta = {
  id: string;
  /** Short human title, e.g. "Numbers & Time", "May 25", "Mixed review". */
  title: string;
  /** Small label above the title, e.g. "HSK 1 · Unit 2", "Tutor lesson". */
  kicker: string;
  group: LessonGroup;
  /** HSK level for group 'hsk' (1, 2, ...); 0 otherwise. */
  level: number;
  /** Sort key within the group (unit number or date serial). */
  order: number;
};

// Fallback titles when the deck ships no unit metadata (deck-provided titles
// always win - see logic/course.ts).
const HSK_TITLES: Record<string, string> = {
  Greetings: 'Greetings',
  Numbers_Time: 'Numbers & Time',
  Family: 'Family',
  Food_Drink: 'Food & Drink',
  Places_Movement: 'Places & Movement',
  Daily_Actions: 'Daily Actions',
  Weather_Description: 'Weather & Description',
  Things_Language: 'Things & Language',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function lessonMeta(lessonId: string): LessonMeta {
  const hsk = lessonId.match(/^HSK(\d+)_(\d+)_(.+)$/);
  if (hsk) {
    const level = Number(hsk[1]);
    const unit = Number(hsk[2]);
    return {
      id: lessonId,
      title: HSK_TITLES[hsk[3]] ?? hsk[3].replaceAll('_', ' & '),
      kicker: `HSK ${level} · Unit ${unit}`,
      group: 'hsk',
      level,
      order: unit,
    };
  }

  const tutor = lessonId.match(/^(?:Tutor|Demo)_(\d{2})(\d{2})(\d{2})(?:-(\d+))?$/);
  if (tutor) {
    const month = Number(tutor[2]);
    const day = Number(tutor[3]);
    const monthName = MONTHS[month - 1] ?? `M${month}`;
    const suffix = tutor[4] ? ` (${tutor[4]})` : '';
    return {
      id: lessonId,
      title: `${monthName} ${day}${suffix}`,
      kicker: 'Tutor lesson',
      group: 'tutor',
      level: 0,
      order: Number(`${tutor[1]}${tutor[2]}${tutor[3]}`) * 10 + Number(tutor[4] ?? 0),
    };
  }

  if (lessonId === 'Review_expanded') {
    return { id: lessonId, title: 'Mixed review', kicker: 'Generated practice', group: 'review', level: 0, order: 0 };
  }

  // A tutor-prefixed id that misses the strict date pattern must still never
  // render its raw prefix to a learner.
  const personal = lessonId.match(/^(?:Tutor|Demo)_(.*)$/);
  if (personal) {
    return {
      id: lessonId,
      title: personal[1].replaceAll('_', ' ').trim() || 'Tutor lesson',
      kicker: 'Tutor lesson',
      group: 'tutor',
      level: 0,
      order: 0,
    };
  }

  return { id: lessonId, title: lessonId.replaceAll('_', ' '), kicker: 'Lesson', group: 'other', level: 0, order: 0 };
}

/** Short label for tight spots (card meta, queue rows). */
export function lessonLabel(lessonId: string) {
  return lessonMeta(lessonId).title;
}
