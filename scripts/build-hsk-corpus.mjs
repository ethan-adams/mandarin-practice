// Build the HSK vocabulary deck at public/mandarin-source.json.
//
// Source: the Complete HSK Vocabulary dataset (MIT, Yanis Zafirópulos)
//   https://github.com/drkameleon/complete-hsk-vocabulary
// See NOTICE for attribution.
//
// This is the exact, deterministic transform used to produce the shipped deck,
// kept in the repo so the derived JSON is auditable and easy to extend. Change
// LEVELS to cover more HSK 3.0 levels (1 to 7). No randomness: ids and ordering
// are stable across runs.
//
//   node scripts/build-hsk-corpus.mjs
//
// The deck ships NO speechPhonemes, so its cards are spoken by the browser's
// Chinese voice (the neural Kokoro engine needs per-card phonemes, generated
// separately). pinyin uses tone-numbered, space-separated syllables (e.g.
// "ai4 hao4") to match the app's existing format and the tone assessment.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LEVELS = [1, 2, 3]; // HSK 3.0 levels to include, one unit per level
const TARGET = 25; // words per lesson (top of the 15 to 25 range keeps lesson counts sane)
const SOURCE = (level) =>
  `https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/new/${level}.json`;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(repoRoot, 'public', 'mandarin-source.json');

function tidy(text) {
  return text
    .replace(/[\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63\uFF0D]/g, ' ') // strip every dash form (commas/periods/parentheses only)
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[;:,\.\s]+/u, '')
    .replace(/[;:,\.\s]+$/u, '')
    .trim();
}

// Pick the PRIMARY sense from a form's meanings. This dataset lists meanings
// most-important first, and within a meaning the senses are ";"-separated with
// the core sense first (好 => "good", not "so"; 是 => "to be", not "true"). So
// take the first meaning's first sub-sense. Parentheticals are dropped first
// ("to be (followed by substantives only)" => "to be"); if that empties
// everything (grammatical particles like 了 are defined only inside
// parentheses) the parenthetical text is kept as a fallback. An over-long sense
// is trimmed to its first clause so the prompt stays a prompt.
function cleanGloss(meanings) {
  const list = meanings ?? [];
  const firstSense = (raw, dropParens) => {
    for (const piece of String(raw ?? '').split(';')) {
      const s = tidy(dropParens ? piece.replace(/\([^)]*\)/g, ' ') : piece.replace(/[()]/g, ' '));
      if (s.length >= 2) return s;
    }
    return '';
  };

  let best = '';
  for (const raw of list) {
    best = firstSense(raw, true);
    if (best) break;
  }
  if (!best) {
    for (const raw of list) {
      best = firstSense(raw, false);
      if (best) break;
    }
  }
  if (best.length > 40 && best.includes(',')) {
    const head = tidy(best.slice(0, best.indexOf(',')));
    if (head.length >= 3) best = head;
  }
  return best;
}

// Prefer the common-word form (lowercase pinyin) over a proper-noun form
// (capitalized pinyin: names, places, historical terms) so 大学 reads
// "university", not "the Great Learning".
function pickForm(forms) {
  const common = (forms ?? []).find(
    (form) => form?.transcriptions?.numeric && !/^[A-Z]/.test(form.transcriptions.numeric.trim()),
  );
  return common ?? forms?.[0];
}

// Split N items into lessons of at most TARGET, as even as possible.
function lessonSizes(total) {
  const count = Math.max(1, Math.ceil(total / TARGET));
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

async function fetchLevel(level) {
  const response = await fetch(SOURCE(level));
  if (!response.ok) throw new Error(`Fetch failed for level ${level}: ${response.status}`);
  return response.json();
}

async function main() {
  const cards = [];
  const units = [];

  for (const level of LEVELS) {
    const entries = await fetchLevel(level);
    const words = [];
    for (const entry of entries) {
      const form = pickForm(entry.forms);
      const answerZh = entry.simplified;
      const pinyin = form?.transcriptions?.numeric;
      const promptEn = cleanGloss(form?.meanings);
      if (!answerZh || !pinyin || !promptEn) continue; // keep the deck honest: skip unusable rows
      words.push({ answerZh, pinyin, promptEn });
    }

    const lessons = [];
    let cursor = 0;
    let seq = 0;
    lessonSizes(words.length).forEach((size, index) => {
      const start = cursor + 1;
      const end = cursor + size;
      const lessonId = `HSK_${level}_Words_${start}_to_${end}`;
      for (let i = 0; i < size; i += 1) {
        seq += 1;
        const word = words[cursor + i];
        cards.push({
          id: `hsk${level}-${String(seq).padStart(4, '0')}`,
          lessonId,
          promptEn: word.promptEn,
          answerZh: word.answerZh,
          pinyin: word.pinyin,
        });
      }
      lessons.push({ id: lessonId, title: `Words ${start} to ${end}`, order: index + 1, cardCount: size });
      cursor = end;
    });

    units.push({ id: `hsk${level}`, title: `HSK ${level}`, level: String(level), order: level, lessons });
  }

  const payload = {
    card_count: cards.length,
    lesson_count: units.reduce((sum, unit) => sum + unit.lessons.length, 0),
    units,
    cards,
  };

  const json = JSON.stringify(payload, null, 2) + '\n';
  if (/[\u2013\u2014]/.test(json)) throw new Error('Refusing to write: output contains em/en dash characters');

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, json);
  console.log(`Wrote ${cards.length} cards, ${payload.lesson_count} lessons across ${units.length} units to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
