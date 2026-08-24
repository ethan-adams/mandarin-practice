// Listening practice, rebuilt on the real deck and its native audio. A round
// plays one card's prebuilt clip and asks which word you heard; distractors are
// chosen to be genuinely confusable (same first syllable — i.e. a tone/near
// minimal pair — then same lesson, then anything), so it tests the ear rather
// than giving the answer away. Deterministic in `index` so it can be tested and
// resumed without Math.random.
import type { Card } from '../mandarin/logic/deck';
import { tonelessSyllable } from './mandarinSound';

export type ListeningRound = {
  targetId: string;
  optionIds: string[];
  selectedId: string | null;
  audioUnavailable: boolean;
};

export type ListeningResult = { targetId: string; correct: boolean; timestamp: string };

const OPTION_COUNT = 4;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** First toneless syllable of a card's reading, for grouping confusable cards. */
function firstSyllable(card: Card): string | null {
  return tonelessSyllable(card.pinyin.trim().split(/\s+/)[0]);
}

/** Full spoken form (with tones), so two cards that sound identical (能 "can" vs
 *  能 "can, may") are never both offered — you couldn't tell them apart by ear. */
function soundKey(card: Card): string {
  return card.pinyin.trim().toLowerCase().replace(/\s+/g, '');
}

/** Deterministic shuffle: order by a per-item hash salted with the seed. */
function shuffle<T extends { id: string }>(items: readonly T[], seed: number): T[] {
  return items.slice().sort((a, b) => stableHash(`${a.id}:${seed}`) - stableHash(`${b.id}:${seed}`));
}

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/**
 * Build one multiple-choice listening round from the pool, or null if there
 * aren't enough distinct cards. Prefers cards that have prebuilt audio for the
 * target so there is a real clip to play.
 */
export function buildListeningRound(pool: readonly Card[], index: number): ListeningRound | null {
  const withAudio = pool.filter((card) => card.audioUrl);
  const targetable = withAudio.length ? withAudio : pool;
  if (pool.length < 2 || !targetable.length) return null;

  const target = shuffle(targetable, index)[0];
  const targetSyllable = firstSyllable(target);
  const targetSound = soundKey(target);

  // Distractors must sound different from the target and from each other (a
  // listening test where two options are homophones is unanswerable), so filter
  // by distinct hanzi AND distinct spoken form.
  const others = pool.filter(
    (card) => card.id !== target.id && card.answerZh !== target.answerZh && soundKey(card) !== targetSound,
  );
  if (!others.length) return null;

  const confusable = targetSyllable ? others.filter((card) => firstSyllable(card) === targetSyllable) : [];
  const sameLesson = others.filter((card) => card.lessonId === target.lessonId);
  const ranked = dedupeById([
    ...shuffle(confusable, index + 1),
    ...shuffle(sameLesson, index + 2),
    ...shuffle(others, index + 3),
  ]);

  const distractors: Card[] = [];
  const usedSounds = new Set<string>([targetSound]);
  for (const card of ranked) {
    const sound = soundKey(card);
    if (usedSounds.has(sound)) continue; // keep every option a distinct sound
    usedSounds.add(sound);
    distractors.push(card);
    if (distractors.length === OPTION_COUNT - 1) break;
  }

  const optionIds = shuffle([target, ...distractors], index + 4).map((card) => card.id);
  return { targetId: target.id, optionIds, selectedId: null, audioUnavailable: false };
}

export function isRoundCorrect(round: ListeningRound): boolean | null {
  if (!round.selectedId) return null;
  return round.selectedId === round.targetId;
}
