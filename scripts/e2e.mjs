// End-to-end test of the real pronunciation pipeline, driven entirely by the
// machine: synthesize speech for a word, feed it into Chromium as a fake
// microphone, click Speak in the live app, and read back the verdict the
// transcription server produced. No human mic needed.
//
//   BASE_URL   target app (default: prod https://mandarin.ethanadams.dev)
//   WORD       what to "say" into the mic (default: 爱)
//   VOICE      macOS `say` voice (default: Meijia, a Mandarin voice)
//   HEADED=1   watch it run
//
// Usage: npm run e2e   (or  BASE_URL=http://localhost:5173 npm run e2e)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://mandarin.ethanadams.dev';
const WORD = process.env.WORD ?? '爱';
const VOICE = process.env.VOICE ?? 'Meijia';
const OUT = 'docs/e2e';
mkdirSync(OUT, { recursive: true });

// 1. Synthesize the word to a WAV the way Chromium's fake mic wants it
//    (16-bit PCM, mono, 48 kHz).
const aiff = resolve(OUT, 'say.aiff');
const wav = resolve(OUT, 'say.wav');
// Speak a touch slower for clarity, then normalize loudness and append ~1.4s of
// silence so that when Chromium loops the file each repeat is a clean utterance
// with a gap — Whisper needs a real pause, not a rapid-fire smear.
execFileSync('say', ['-v', VOICE, '-r', '150', '-o', aiff, WORD]);
execFileSync(
  'ffmpeg',
  ['-y', '-i', aiff, '-af', 'loudnorm=I=-16:TP=-1.5,apad=pad_dur=1.0', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', wav],
  { stdio: 'ignore' },
);
const audioDataUrl = `data:audio/wav;base64,${readFileSync(wav).toString('base64')}`;
console.log(`Synthesized "${WORD}" with voice ${VOICE} -> ${wav}`);

// 2. Launch Chromium. Instead of Chromium's picky fake-file player (which
//    silently falls back to a beep), we override getUserMedia in-page to return
//    a looping MediaStream built from our WAV — real audio for both the tone
//    analyser and the recorder that uploads to the server.
const browser = await chromium.launch({
  headless: !process.env.HEADED,
  args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 460, height: 900 }, deviceScaleFactor: 2 });
await page.addInitScript((dataUrl) => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]), (c) => c.charCodeAt(0));
    const buffer = await ctx.decodeAudioData(bytes.buffer);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const dest = ctx.createMediaStreamDestination();
    source.connect(dest);
    source.start();
    return dest.stream;
  };
}, audioDataUrl);
const DEBUG = Boolean(process.env.DEBUG);
page.on('console', (m) => {
  if (DEBUG || m.type() === 'error') console.log('  [page]', m.type(), m.text());
});
if (DEBUG) {
  page.on('requestfinished', async (req) => {
    if (req.url().includes('/v1/transcribe')) {
      const res = await req.response();
      console.log(`  [net] ${req.method()} ${req.url()} -> ${res?.status()}`, await res?.text().catch(() => ''));
    }
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes('mandarin-api')) console.log(`  [net FAIL] ${req.url()} ${req.failure()?.errorText}`);
  });
}

if (DEBUG) {
  await page.addInitScript(() => {
    window.addEventListener('error', (e) => console.log('WINDOW ERROR', e.message));
    window.addEventListener('unhandledrejection', (e) => console.log('UNHANDLED', String(e.reason)));
    const md = navigator.mediaDevices;
    const g = md.getUserMedia.bind(md);
    md.getUserMedia = (...a) => {
      console.log('GUM called');
      return g(...a).then((s) => { console.log('GUM resolved tracks=', s.getAudioTracks().length); return s; }).catch((e) => { console.log('GUM rejected', String(e)); throw e; });
    };
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      window.AudioContext = class extends AC {
        constructor(...a) { super(...a); console.log('AudioContext state=', this.state); }
      };
    }
    const MR = window.MediaRecorder;
    if (MR) {
      window.MediaRecorder = class extends MR {
        constructor(...a) { super(...a); console.log('MediaRecorder created'); }
      };
    }
  });
}

let ok = false;
try {
  console.log(`Opening ${BASE} …`);
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });

  // 3. Enter practice from the course home, then wait for a card.
  await page.getByRole('button', { name: /^Start/ }).first().click();
  const speak = page.getByRole('button', { name: 'Speak', exact: true });
  await speak.waitFor({ timeout: 25000 });
  // Let the corpus finish loading and the deck settle: a deck swap mid-capture
  // fires the session's onReset and wipes the attempt.
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/1-card.png` });
  console.log('On a practice card.');

  // (No pre-Speak getUserMedia probe: opening a capture would consume the fake
  // audio and leave silence for the real attempt.)

  // 4. Speak: records the fake audio, uploads it, and scores it.
  await speak.click();
  console.log('Spoke into the fake mic; watching the card …');

  // Poll the card text right away so we see it move idle -> Listening -> verdict.
  let last = '';
  for (let i = 0; i < 40; i++) {
    const t = (await page.locator('.verdict-card').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (t !== last) {
      console.log(`  [t+${(i * 0.4).toFixed(1)}s] ${t.slice(0, 100)}`);
      last = t;
    }
    if (i === 6) await page.screenshot({ path: `${OUT}/mid.png` });
    if (t.includes('Heard')) break;
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/2-verdict.png` });

  const verdict = (await page.locator('.verdict-card').innerText()).trim();
  console.log('\n--- verdict card ---\n' + verdict + '\n--------------------');

  ok = verdict.includes('Heard');
  console.log(ok ? `PASS: the pipeline transcribed the mic audio and rendered a Word verdict.` : `FAIL: no Word read-back rendered (server offline, or capture did not reach the server).`);
} catch (error) {
  console.log('ERROR:', error.message);
  await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
} finally {
  await browser.close();
}

process.exit(ok ? 0 : 1);
