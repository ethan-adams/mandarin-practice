// Deck loading for the Mandarin learning core: fetch + validate the exported
// corpus. Throws on any unusable payload so the caller can surface the failure
// visibly (never silently practice the wrong deck).

import type { MandarinCard } from '../data/mandarinFallbackCards';
import { API_BASE } from '../../config';

export type Card = MandarinCard;

export type DeckUnitLesson = {
  id: string;
  title: string;
  order: number;
  cardCount?: number;
};

export type DeckUnit = {
  id: string;
  title: string;
  level?: string;
  order: number;
  lessons: DeckUnitLesson[];
};

export type CorpusPayload = {
  card_count?: number;
  lesson_count?: number;
  cards?: Card[];
  units?: DeckUnit[];
};

export type LoadedCorpus = {
  cards: Card[];
  cardCount: number;
  lessonCount: number;
  units: DeckUnit[] | null;
};

function validUnits(units: unknown): DeckUnit[] | null {
  if (!Array.isArray(units) || !units.length) return null;
  const cleaned = units.filter(
    (unit): unit is DeckUnit =>
      Boolean(unit) &&
      typeof (unit as DeckUnit).id === 'string' &&
      typeof (unit as DeckUnit).title === 'string' &&
      Array.isArray((unit as DeckUnit).lessons) &&
      (unit as DeckUnit).lessons.every((lesson) => lesson && typeof lesson.id === 'string' && typeof lesson.title === 'string'),
  );
  return cleaned.length ? cleaned : null;
}

// Content now lives in mandarin-api (Postgres), fetched from `${API_BASE}/v1/content`
// (2026-08-20 pivot). The bundled `public/mandarin-source.json` stays as an offline
// fallback: used when the server isn't configured or is unreachable, so the app
// never hard-fails to a blank deck.
async function fetchCorpusPayload(): Promise<CorpusPayload> {
  if (API_BASE) {
    try {
      const response = await fetch(`${API_BASE}/v1/content`, { cache: 'no-cache' });
      if (response.ok) return (await response.json()) as CorpusPayload;
    } catch {
      // Fall through to the bundled corpus below.
    }
  }
  const response = await fetch('/mandarin-source.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Corpus request failed (${response.status})`);
  return (await response.json()) as CorpusPayload;
}

export async function fetchMandarinCorpus(): Promise<LoadedCorpus> {
  const payload = await fetchCorpusPayload();
  // speechPhonemes is intentionally not required: cards without it are spoken by
  // the browser voice (see SpeechController.speakAnswer). id/promptEn/answerZh/
  // pinyin are the minimum a card needs to be practicable.
  const cards = Array.isArray(payload.cards)
    ? payload.cards.filter((card) => card.id && card.promptEn && card.answerZh && card.pinyin)
    : [];
  if (!cards.length) throw new Error('Corpus payload contained no usable cards');
  return {
    cards,
    cardCount: payload.card_count ?? cards.length,
    lessonCount: payload.lesson_count ?? new Set(cards.map((card) => card.lessonId)).size,
    units: validUnits(payload.units),
  };
}
