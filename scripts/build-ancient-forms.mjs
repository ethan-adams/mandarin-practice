// Build public/ancient/: ancient-form glyphs (oracle-bone 甲骨文, bronze 金文,
// seal 篆書) for the deck's characters, for the Character Story evolution view.
// Source is Wikimedia Commons' public-domain "Ancient Chinese characters" project
// (古漢字), whose files follow a systematic name: <char>-oracle.svg / -bronze.svg /
// -seal.svg. Coverage is partial, so the app only shows the evolution for a
// character that actually has forms (see public/ancient/manifest.json).
//
// MANUAL step, NOT part of predev/prebuild — normal dev and Vercel builds use the
// committed SVGs + manifest and make no network calls. Re-run when the deck's
// characters change:  npm run build-ancient-forms
//
// Uses the MediaWiki API (batched, polite) to resolve which files exist and their
// URLs, then downloads only those. All fetched art is public domain (PD ancient
// script); attribution kept in public/ancient/README.md.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'public/ancient');
mkdirSync(outDir, { recursive: true });

const API = 'https://commons.wikimedia.org/w/api.php';
// Wikimedia asks for a descriptive UA with a contact/URL.
const UA = 'MandarinPractice/1.0 (https://mandarin.ethanadams.dev; character-story build script) node';
// Oldest → newest; the evolution view renders them in this order before modern.
const FORMS = ['oracle', 'bronze', 'seal'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wikimedia rate-limits anonymous traffic hard; back off politely on 429/503.
async function politeFetch(url, opts = {}, attempt = 0) {
  const res = await fetch(url, opts);
  if ((res.status === 429 || res.status === 503) && attempt < 7) {
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(2000 * 2 ** attempt, 60000);
    process.stdout.write(`\r429/503 — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1})…            `);
    await sleep(waitMs);
    return politeFetch(url, opts, attempt + 1);
  }
  return res;
}

const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const deck = JSON.parse(readFileSync(resolve(root, 'public/mandarin-source.json'), 'utf8'));
const cards = Array.isArray(deck.cards) ? deck.cards : [];
const chars = new Set();
for (const card of cards) for (const ch of card?.answerZh ?? '') if (isHan(ch)) chars.add(ch);

// title -> {char, form}
const titles = [];
for (const ch of chars) for (const form of FORMS) titles.push({ title: `File:${ch}-${form}.svg`, char: ch, form });

async function apiImageUrls(batchTitles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    maxlag: '5',
    prop: 'imageinfo',
    iiprop: 'url',
    titles: batchTitles.join('|'),
  });
  const res = await politeFetch(`${API}?${params}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return { urlByTitle: new Map(), norm: new Map() };
  const data = await res.json();
  const norm = new Map();
  for (const n of data?.query?.normalized ?? []) norm.set(n.from, n.to);
  const urlByTitle = new Map();
  for (const page of data?.query?.pages ?? []) {
    if (page.missing) continue;
    const url = page.imageinfo?.[0]?.url;
    if (url) urlByTitle.set(page.title, url);
  }
  return { urlByTitle, norm };
}

// Rebuild the manifest from what's on disk (so a killed run keeps a valid one).
function writeManifest() {
  const manifest = {};
  for (const ch of [...chars].sort()) {
    const forms = FORMS.filter((form) => existsSync(resolve(outDir, `${ch}-${form}.svg`)));
    if (forms.length) manifest[ch] = forms;
  }
  writeFileSync(resolve(outDir, 'manifest.json'), JSON.stringify(manifest));
  return Object.keys(manifest).length;
}

// Resolve + download interleaved, in batches of 50, writing the manifest after
// each batch. Partial progress survives throttling or an interrupt.
let found = 0;
let downloaded = 0;
for (let i = 0; i < titles.length; i += 50) {
  const batch = titles.slice(i, i + 50);
  // Skip a batch entirely if all its files already exist on disk (fast resume).
  const pending = batch.filter((b) => !existsSync(resolve(outDir, `${b.char}-${b.form}.svg`)));
  if (pending.length) {
    const { urlByTitle, norm } = await apiImageUrls(pending.map((b) => b.title));
    for (const b of pending) {
      const url = urlByTitle.get(norm.get(b.title) ?? b.title) ?? urlByTitle.get(b.title);
      if (!url) continue;
      found += 1;
      try {
        const res = await politeFetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) continue;
        writeFileSync(resolve(outDir, `${b.char}-${b.form}.svg`), await res.text());
        downloaded += 1;
        await sleep(150);
      } catch {
        // skip a single-file failure; manifest reflects only what landed
      }
    }
    await sleep(600);
  }
  writeManifest();
  process.stdout.write(`\r${Math.min(i + 50, titles.length)}/${titles.length} checked · ${downloaded} downloaded            `);
}
process.stdout.write('\n');
const withForms = writeManifest();

writeFileSync(
  resolve(outDir, 'README.md'),
  `# Ancient character forms\n\nOracle-bone (甲骨文), bronze (金文), and seal (篆書) glyphs from Wikimedia\nCommons' public-domain "Ancient Chinese characters" project (古漢字):\nhttps://commons.wikimedia.org/wiki/Commons:Ancient_Chinese_characters_project\n\nAll files here are public domain (PD ancient script). Regenerate with\n\`npm run build-ancient-forms\`. \`manifest.json\` lists which forms each\ncharacter has; the app only shows an evolution when forms exist.\n`,
);

console.log(`ancient forms: ${withForms}/${chars.size} deck characters have ≥1 form; ${found} files available, ${downloaded} newly downloaded.`);
