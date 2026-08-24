// Automated proxy for docs/CORE-LOOP-TEST.md step 1 (the core promise: does the
// speak -> judge verdict track reality?). Drives the LIVE app by deep-linking to
// known cards, synthesizing the card's answer with macOS `say` (real Mandarin
// voices) as a fake mic, and reading back the Word + Tone verdict. Runs each card
// CORRECT (say the answer) and WRONG (say a clearly different word / a wrong-tone
// sibling) and tallies whether the verdict flips as it should.
//
// This is NOT a human mouth on a real mic — it's the closest automation can get:
// synthetic voices through the whole real pipeline (browser capture -> upload ->
// server whisper + YIN tone -> verdict). Treat the numbers as a regression signal,
// not proof the feedback feels right to a person.
//
//   BASE_URL=https://mandarin.ethanadams.dev node scripts/core-loop-audit.mjs
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.BASE_URL ?? 'https://mandarin.ethanadams.dev';
const VOICES = (process.env.VOICES ?? 'Meijia,Tingting').split(',');
const OUT = 'docs/e2e';
mkdirSync(OUT, { recursive: true });
mkdirSync('scripts/.cache/audit', { recursive: true });

const corpus = JSON.parse(readFileSync('public/mandarin-source.json', 'utf8'));
const cards = corpus.cards ?? corpus;
const byZh = new Map();
for (const c of cards) if (!byZh.has(c.answerZh)) byZh.set(c.answerZh, c);
const han = (s) => [...s].filter((ch) => /\p{Script=Han}/u.test(ch));

function cardFor(zh) {
  const c = byZh.get(zh);
  if (!c) throw new Error(`no card for ${zh}`);
  return c;
}

// Synthesize a word to a 48kHz mono PCM WAV (what Chromium's decodeAudioData +
// our loop want), base64. Cached by word+voice.
function synth(text, voice) {
  const key = `${voice}-${Buffer.from(text).toString('hex')}`;
  const wav = resolve('scripts/.cache/audit', `${key}.wav`);
  if (!existsSync(wav)) {
    const aiff = resolve('scripts/.cache/audit', `${key}.aiff`);
    execFileSync('say', ['-v', voice, '-r', '150', '-o', aiff, text]);
    execFileSync('ffmpeg', ['-y', '-i', aiff, '-af', 'loudnorm=I=-16:TP=-1.5,apad=pad_dur=1.0', '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le', wav], { stdio: 'ignore' });
  }
  return readFileSync(wav).toString('base64');
}

// --- word fairness set: two-syllable cards + a clearly-different distractor ----
const WORD_SET = ['你好', '谢谢', '老师', '朋友', '中国', '喜欢', '学生', '学校', '中文', '再见'].filter((w) => byZh.has(w));
const DISTRACTOR = '西瓜'; // "watermelon": sound-distinct from all of the above

// --- tone fairness set: minimal pairs (same segment, different tone) -----------
const TONE_SETS = [
  { seg: 'ma', words: ['妈', '马', '骂'] },
  { seg: 'ba', words: ['八', '爸'] },
];

async function readVerdict(page) {
  const lines = await page.locator('.verdict-card .line').all();
  const out = {};
  for (const line of lines) {
    const key = (await line.locator('.key').innerText().catch(() => '')).trim().toLowerCase();
    const status = await line.getAttribute('data-status');
    const val = (await line.locator('.val').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    if (key) out[key] = { status, val };
  }
  return out;
}

async function attempt(page, cardId, audioB64) {
  await page.goto(`${BASE}/mandarin/${cardId}`, { waitUntil: 'networkidle', timeout: 45000 });
  const speak = page.getByRole('button', { name: 'Speak', exact: true });
  await speak.waitFor({ timeout: 25000 });
  await page.waitForTimeout(3200); // let the real corpus settle onto this card
  await page.evaluate((b64) => { window.__micWav = b64; }, audioB64);
  // Read the verdict ONLY after the server /v1/transcribe response lands, so we
  // measure the SERVER word + tone verdict, not the browser's early estimate.
  const waitResp = page.waitForResponse((r) => r.url().includes('/v1/transcribe'), { timeout: 30000 }).catch(() => null);
  await speak.click();
  await waitResp;
  await page.waitForTimeout(700); // let Svelte render the server-sourced lines
  return readVerdict(page);
}

const WORD_MATCH = (v) => v.word && (v.word.status === 'match' || v.word.status === 'near');
const WORD_REJECT = (v) => v.word && v.word.status === 'off';
const TONE_OK = (v) => v.tone && (v.tone.status === 'match' || v.tone.status === 'near');
const TONE_BAD = (v) => v.tone && v.tone.status === 'off';

async function main() {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 460, height: 900 } });
  await page.addInitScript(() => {
    window.__micWav = null;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const bytes = Uint8Array.from(atob(window.__micWav), (c) => c.charCodeAt(0));
      const buffer = await ctx.decodeAudioData(bytes.buffer);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const dest = ctx.createMediaStreamDestination();
      src.connect(dest);
      src.start();
      return dest.stream;
    };
  });

  const report = { word: [], tone: [] };
  let vi = 0;
  const nextVoice = () => VOICES[vi++ % VOICES.length];

  console.log(`\n== WORD fairness (say the answer vs say "${DISTRACTOR}") ==`);
  for (const zh of WORD_SET) {
    if (han(zh).length < 2) continue;
    const card = cardFor(zh);
    const voice = nextVoice();
    const correct = await attempt(page, card.id, synth(zh, voice));
    const wrong = await attempt(page, card.id, synth(DISTRACTOR, voice));
    const row = { zh, voice, correct: correct.word, wrong: wrong.word, tone: correct.tone };
    report.word.push(row);
    console.log(`  ${zh} (${voice}): correct→ word[${correct.word?.status}] tone[${correct.tone?.status}] | wrong→ word[${wrong.word?.status}]`);
  }

  console.log(`\n== TONE fairness (say the card vs a wrong-tone sibling) ==`);
  for (const set of TONE_SETS) {
    for (const zh of set.words) {
      if (!byZh.has(zh)) continue;
      const card = cardFor(zh);
      const voice = nextVoice();
      const right = await attempt(page, card.id, synth(zh, voice));
      const sibling = set.words.find((w) => w !== zh && byZh.has(w));
      const wrongTone = sibling ? await attempt(page, card.id, synth(sibling, voice)) : null;
      report.tone.push({ zh, voice, right: right.tone, wrongToneWord: sibling, wrongTone: wrongTone?.tone });
      console.log(`  ${zh} (${voice}): say-${zh}→ tone[${right.tone?.status}] | say-${sibling}→ tone[${wrongTone?.tone?.status}]`);
    }
  }

  await browser.close();

  // Tallies
  const wc = report.word;
  const correctRecognized = wc.filter((r) => WORD_MATCH({ word: r.correct })).length;
  const wrongRejected = wc.filter((r) => WORD_REJECT({ word: r.wrong })).length;
  const toneCorrectOk = wc.filter((r) => TONE_OK({ tone: r.tone })).length;
  console.log(`\n=== RESULTS ===`);
  console.log(`Word: correct recognized  ${correctRecognized}/${wc.length}`);
  console.log(`Word: wrong rejected       ${wrongRejected}/${wc.length}`);
  console.log(`Tone: correct pronounced landed matched/close ${toneCorrectOk}/${wc.length}`);
  const tc = report.tone;
  const toneRightOk = tc.filter((r) => TONE_OK({ tone: r.right })).length;
  const toneWrongFlagged = tc.filter((r) => r.wrongTone && !TONE_OK({ tone: r.wrongTone })).length;
  console.log(`Tone pairs: right-tone accepted ${toneRightOk}/${tc.length} | wrong-tone not-accepted ${toneWrongFlagged}/${tc.filter((r) => r.wrongTone).length}`);
  writeFileSync(resolve(OUT, 'core-loop-audit.json'), JSON.stringify(report, null, 2));
  console.log(`\nfull report -> ${OUT}/core-loop-audit.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
