// Build per-word example sentences for the deck from Tatoeba (real native
// sentences with English translations, CC BY 2.0). MANUAL / offline, like the
// hanzi-dict and ancient-form builders: downloads the Tatoeba exports into a
// gitignored cache, matches them against the deck's vocabulary, and writes a
// small committed public/mandarin-examples.json. Vercel serves the committed
// JSON; it never fetches at build time. $0, no LLM, no hallucinated Chinese.
//
//   node scripts/build-examples.mjs
//
// Attribution is required by CC BY 2.0 (FR) and is embedded in the output plus
// shown in the app. Sentences: https://tatoeba.org (CC BY 2.0 FR).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as OpenCC from 'opencc-js';

// Tatoeba cmn mixes simplified and traditional. Convert every sentence to
// simplified at build time (opencc-js is a build-only devDependency, never in
// the app bundle) so the app only ever shows simplified — and no sentence is
// wasted for using a traditional glyph. Runs before matching, so deck words
// (simplified) line up.
const toSimplified = OpenCC.Converter({ from: 't', to: 'cn' });

const CACHE = resolve('scripts/.cache/tatoeba');
const OUT = resolve('public/mandarin-examples.json');
const BASE = 'https://downloads.tatoeba.org/exports/per_language';

const FILES = {
  cmn: `${BASE}/cmn/cmn_sentences.tsv.bz2`,
  eng: `${BASE}/eng/eng_sentences.tsv.bz2`,
  links: `${BASE}/cmn/cmn-eng_links.tsv.bz2`,
};

// Beginner-friendly bounds and caps.
const MIN_HANZI = 4;
const MAX_HANZI = 14;
const MAX_PER_WORD = 2;
const MAX_WORD_LEN = 4; // only vocabulary words get examples; longer cards ARE sentences

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const hanCount = (s) => [...s].filter(isHan).length;
const hasLatin = (s) => /[A-Za-z]/.test(s);

function fetchAndUnpack(name, url) {
  mkdirSync(CACHE, { recursive: true });
  const tsv = resolve(CACHE, `${name}.tsv`);
  if (existsSync(tsv)) return tsv;
  const bz2 = resolve(CACHE, `${name}.tsv.bz2`);
  console.log(`  downloading ${name} …`);
  execFileSync('curl', ['-sSL', '-o', bz2, url]);
  execFileSync('bunzip2', ['-kf', bz2]);
  return tsv;
}

// TSV rows: "id\tlang\ttext" (sentences) or "cmnId\tengId" (links).
function readSentences(tsv) {
  const map = new Map();
  for (const line of readFileSync(tsv, 'utf8').split('\n')) {
    const tab1 = line.indexOf('\t');
    if (tab1 < 0) continue;
    const id = line.slice(0, tab1);
    const rest = line.slice(tab1 + 1);
    const tab2 = rest.indexOf('\t');
    if (tab2 < 0) continue;
    map.set(id, rest.slice(tab2 + 1));
  }
  return map;
}

function readLinks(tsv) {
  const map = new Map(); // cmnId -> engId (first seen)
  for (const line of readFileSync(tsv, 'utf8').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const cmnId = line.slice(0, tab);
    const engId = line.slice(tab + 1).trim();
    if (!map.has(cmnId)) map.set(cmnId, engId);
  }
  return map;
}

function deckWords() {
  const src = JSON.parse(readFileSync(resolve('public/mandarin-source.json'), 'utf8'));
  const cards = src.cards ?? src;
  const words = new Set();
  for (const card of cards) {
    const w = card.answerZh ?? '';
    const len = hanCount(w);
    if (len >= 1 && len <= MAX_WORD_LEN && [...w].every((ch) => isHan(ch))) words.add(w);
  }
  return words;
}

function main() {
  const words = deckWords();
  console.log(`deck vocabulary words (<= ${MAX_WORD_LEN} hanzi): ${words.size}`);

  const cmn = readSentences(fetchAndUnpack('cmn', FILES.cmn));
  const eng = readSentences(fetchAndUnpack('eng', FILES.eng));
  const links = readLinks(fetchAndUnpack('links', FILES.links));
  console.log(`Tatoeba: ${cmn.size} cmn sentences, ${eng.size} eng sentences, ${links.size} cmn-eng links`);

  // Candidate cmn sentences: right length, has an English translation, clean.
  // Sort shortest-first so each word gets its simplest usable examples.
  const candidates = [];
  const seenZh = new Set();
  for (const [id, rawZh] of cmn) {
    if (hasLatin(rawZh)) continue;
    const zh = toSimplified(rawZh.trim());
    if (seenZh.has(zh)) continue; // trad/simp variants collapse to one after conversion
    const len = hanCount(zh);
    if (len < MIN_HANZI || len > MAX_HANZI) continue;
    const engId = links.get(id);
    const en = engId ? eng.get(engId) : null;
    if (!en) continue;
    seenZh.add(zh);
    candidates.push({ zh, en: en.trim(), len });
  }
  candidates.sort((a, b) => a.len - b.len);
  console.log(`usable cmn+eng candidates: ${candidates.length}`);

  // Slide 1..MAX_WORD_LEN char windows over each sentence; attach to any deck
  // word that appears. Shortest-first order means the first MAX_PER_WORD kept
  // per word are its simplest sentences.
  const examples = {};
  const counts = new Map();
  for (const cand of candidates) {
    const chars = [...cand.zh].filter(isHan);
    const seen = new Set();
    for (let i = 0; i < chars.length; i++) {
      for (let n = 1; n <= MAX_WORD_LEN && i + n <= chars.length; n++) {
        const w = chars.slice(i, i + n).join('');
        if (!words.has(w) || seen.has(w)) continue;
        seen.add(w);
        if ((counts.get(w) ?? 0) >= MAX_PER_WORD) continue;
        (examples[w] ??= []).push({ zh: cand.zh, en: cand.en });
        counts.set(w, (counts.get(w) ?? 0) + 1);
      }
    }
  }

  const covered = Object.keys(examples).length;
  const payload = {
    source: 'Tatoeba (https://tatoeba.org)',
    license: 'CC BY 2.0 FR',
    attribution: 'Example sentences from the Tatoeba Project, licensed CC BY 2.0 FR.',
    wordsCovered: covered,
    examples,
  };
  writeFileSync(OUT, JSON.stringify(payload));
  const bytes = readFileSync(OUT).length;
  console.log(`wrote ${OUT}: ${covered}/${words.size} words covered, ${(bytes / 1024).toFixed(0)} KB`);
}

main();
