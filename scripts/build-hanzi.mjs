// Self-host the stroke data for every Han character in the deck, so writing
// practice makes NO external requests (hanzi-writer defaults to a CDN; we don't).
// Extracts just the characters the corpus uses from the hanzi-writer-data dev
// dependency into public/hanzi/, loaded on demand by WritingPractice.svelte.
// Runs automatically before dev/build; re-run by hand with: npm run build-hanzi
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dataDir = dirname(require.resolve('hanzi-writer-data/package.json'));
const outDir = resolve(root, 'public/hanzi');
mkdirSync(outDir, { recursive: true });

const deck = JSON.parse(readFileSync(resolve(root, 'public/mandarin-source.json'), 'utf8'));
const cards = Array.isArray(deck.cards) ? deck.cards : [];

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const chars = new Set();
for (const card of cards) {
  for (const ch of card?.answerZh ?? '') if (isHan(ch)) chars.add(ch);
}

let copied = 0;
const missing = [];
for (const ch of chars) {
  const src = resolve(dataDir, `${ch}.json`);
  if (!existsSync(src)) {
    missing.push(ch);
    continue;
  }
  copyFileSync(src, resolve(outDir, `${ch}.json`));
  copied += 1;
}

console.log(`hanzi: ${copied}/${chars.size} characters written to public/hanzi/`);
if (missing.length) console.warn(`hanzi: no stroke data for ${missing.length}: ${missing.join(' ')}`);
