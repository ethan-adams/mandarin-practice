// Screenshot the tone-coach verdict states from the dev harness for visual
// self-review. Usage: `npm run shots` (dev server must be running), or point at
// any host with HARNESS_URL. Writes PNGs to docs/shots/.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const url = process.env.HARNESS_URL ?? 'http://localhost:5173/tone-harness.html';
const outDir = 'docs/shots';

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 460, height: 900 },
  deviceScaleFactor: 2,
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForSelector('section[id^="shot-"]');

await page.screenshot({ path: `${outDir}/all.png`, fullPage: true });

const sections = await page.$$('section[id^="shot-"]');
for (const section of sections) {
  const id = await section.getAttribute('id');
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: `${outDir}/${id}.png` });
}

await browser.close();
console.log(`Wrote ${sections.length + 1} screenshots to ${outDir}/`);
