// Walk the live app across its surfaces and record what actually breaks:
// console errors/warnings, failed network requests, and a screenshot per screen.
// Usage: BASE_URL=https://mandarin.ethanadams.dev node scripts/audit.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'https://mandarin.ethanadams.dev';
const OUT = 'docs/audit';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2 });

let surface = 'boot';
const log = [];
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') log.push(`[${surface}] console.${m.type()}: ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => log.push(`[${surface}] PAGEERROR: ${e.message.slice(0, 200)}`));
page.on('requestfailed', (r) => log.push(`[${surface}] REQ FAILED: ${r.url().slice(0, 120)} (${r.failure()?.errorText})`));
page.on('response', (r) => {
  if (r.status() >= 400) log.push(`[${surface}] HTTP ${r.status()}: ${r.url().slice(0, 120)}`);
});

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
const step = async (name, fn) => {
  surface = name;
  try {
    await fn();
    await page.waitForTimeout(1200);
    await shot(name);
    console.log(`✓ ${name}`);
  } catch (e) {
    console.log(`✗ ${name}: ${e.message.slice(0, 120)}`);
    await shot(`${name}-FAIL`);
  }
};

try {
  await step('01-home', async () => {
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
  });

  await step('02-enter-lesson', async () => {
    await page.getByRole('button', { name: /^Start/ }).first().click();
    await page.getByRole('button', { name: 'Speak', exact: true }).waitFor({ timeout: 25000 });
    await page.waitForTimeout(3500); // let corpus settle
  });

  await step('03-reveal', async () => {
    await page.getByRole('button', { name: /Reveal/ }).click();
  });

  await step('04-trace', async () => {
    await page.getByRole('button', { name: /Trace it/ }).click();
  });

  await step('05-character-story', async () => {
    await page.getByRole('button', { name: /See the story of/ }).first().click();
  });

  await step('06-journey', async () => {
    await page.getByRole('button', { name: 'Journey', exact: true }).click();
  });

  await step('07-you', async () => {
    await page.getByRole('button', { name: 'You', exact: true }).click();
  });

  await step('08-explore-then-listening', async () => {
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /^Start/ }).first().click();
    await page.getByRole('button', { name: 'Listening', exact: true }).click();
  });
} finally {
  surface = 'done';
  console.log('\n===== console errors / warnings / failed requests =====');
  if (log.length === 0) console.log('(none captured)');
  else for (const line of [...new Set(log)]) console.log(line);
  await browser.close();
}
