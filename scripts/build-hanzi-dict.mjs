// Build public/hanzi-dict.json: the character-story data (definition, pinyin,
// component decomposition, radical, etymology) for every Han character in the
// deck, plus the components those characters break down into. Source is Make Me
// a Hanzi's dictionary.txt (github.com/skishore/makemeahanzi, MIT-licensed data;
// the Arphic-licensed stroke graphics live separately in public/hanzi/).
//
// This is a MANUAL regeneration step, NOT part of predev/prebuild — normal dev
// and Vercel builds use the committed public/hanzi-dict.json and make no network
// requests. Re-run by hand only when the deck's characters change:
//   npm run build-hanzi-dict                 # fetches dictionary.txt from GitHub
//   MMH_DICT=/path/to/dictionary.txt npm run build-hanzi-dict   # offline source
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const DICT_URL = 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt';

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
// Ideographic Description Characters (U+2FF0–U+2FFB) join components; they are
// structure, not leaves.
const isIDC = (ch) => /[⿰-⿻]/u.test(ch);

/** Leaf components of an IDS decomposition, in reading order. */
function leaves(ids) {
  if (!ids) return [];
  return [...ids].filter((ch) => isHan(ch) && !isIDC(ch) && ch !== '？');
}

async function loadDictionary() {
  const local = process.env.MMH_DICT;
  if (local) return readFileSync(local, 'utf8');
  const res = await fetch(DICT_URL);
  if (!res.ok) throw new Error(`dictionary fetch failed (${res.status}) — set MMH_DICT to a local dictionary.txt`);
  return await res.text();
}

const raw = await loadDictionary();
const entries = raw
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line));
const by = new Map(entries.map((e) => [e.character, e]));

const deck = JSON.parse(readFileSync(resolve(root, 'public/mandarin-source.json'), 'utf8'));
const cards = Array.isArray(deck.cards) ? deck.cards : [];

const deckChars = new Set();
for (const card of cards) for (const ch of card?.answerZh ?? '') if (isHan(ch)) deckChars.add(ch);

// Transitive closure over decomposition, so any component's gloss is available
// when the story view drills into a character's parts.
const want = new Set(deckChars);
let frontier = [...deckChars];
while (frontier.length) {
  const next = [];
  for (const ch of frontier) {
    for (const comp of leaves(by.get(ch)?.decomposition)) {
      if (comp !== ch && !want.has(comp)) {
        want.add(comp);
        next.push(comp);
      }
    }
  }
  frontier = next;
}

const out = {};
const missing = [];
for (const ch of [...want].sort()) {
  const e = by.get(ch);
  if (!e) {
    missing.push(ch);
    continue;
  }
  const entry = {};
  if (e.definition) entry.def = e.definition;
  if (Array.isArray(e.pinyin) && e.pinyin.length) entry.pinyin = e.pinyin[0];
  if (e.decomposition && e.decomposition !== '？') entry.ids = e.decomposition;
  if (e.radical) entry.radical = e.radical;
  if (e.etymology) {
    const et = { t: e.etymology.type };
    if (e.etymology.hint) et.hint = e.etymology.hint;
    if (e.etymology.phonetic) et.phonetic = e.etymology.phonetic;
    if (e.etymology.semantic) et.semantic = e.etymology.semantic;
    entry.ety = et;
  }
  out[ch] = entry;
}

writeFileSync(resolve(root, 'public/hanzi-dict.json'), JSON.stringify(out));
console.log(`hanzi-dict: ${Object.keys(out).length} entries (${deckChars.size} deck chars + components) written to public/hanzi-dict.json`);
if (missing.length) console.warn(`hanzi-dict: no entry for ${missing.length}: ${missing.join(' ')}`);
