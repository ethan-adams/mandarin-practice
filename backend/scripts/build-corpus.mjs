// Derive the subgraph's Character corpus from the app's shipped HSK deck. The
// subgraph exposes only this corpus-derived, read-only data (no user data), so
// it stays free and needs no database. Re-run whenever the deck changes:
//   node backend/scripts/build-corpus.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, '../../public/mandarin-source.json');
const out = resolve(here, '../src/corpus.json');

const deck = JSON.parse(readFileSync(source, 'utf8'));
const cards = Array.isArray(deck.cards) ? deck.cards : [];

/** HSK level from a lesson id like "HSK_1_Words_1_to_25"; null for non-HSK decks. */
const hskOf = (lessonId) => {
  const m = /^HSK_(\d+)_/.exec(lessonId ?? '');
  return m ? Number(m[1]) : null;
};

const seen = new Set();
const characters = [];
for (const card of cards) {
  if (!card?.answerZh || !card.pinyin || !card.promptEn) continue;
  if (seen.has(card.answerZh)) continue; // key is hanzi; first occurrence wins
  seen.add(card.answerZh);
  characters.push({
    hanzi: card.answerZh,
    pinyin: card.pinyin,
    glossEn: card.promptEn,
    hsk: hskOf(card.lessonId),
    lessonId: card.lessonId ?? '',
  });
}

const payload = {
  generatedFrom: 'public/mandarin-source.json',
  cardCount: deck.card_count ?? cards.length,
  lessonCount: deck.lesson_count ?? new Set(cards.map((c) => c.lessonId)).size,
  characters,
};

writeFileSync(out, JSON.stringify(payload, null, 0) + '\n');
console.log(`Wrote ${characters.length} characters to ${out}`);
