import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchMandarinCorpus, type Card } from '../src/lib/mandarin/logic/deck';
import { SpeechController } from '../src/lib/mandarin/state/speech.svelte';
import { PracticeSettings } from '../src/lib/mandarin/state/settings.svelte';

// Optional-phonemes contract: a card may ship without speechPhonemes. The loader
// keeps it (it is still practicable), and playback speaks its hanzi through the
// browser voice instead of loading the neural engine to synthesize nothing. The
// HSK vocabulary corpus at public/mandarin-source.json is exactly this kind of
// deck. Cards that DO ship phonemes keep using the neural engine unchanged.

const shippedCorpus = readFileSync(join(process.cwd(), 'public', 'mandarin-source.json'), 'utf8');

function stubCorpusFetch(handler: () => Response) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/mandarin-source.json') return new Response('Not found', { status: 404 });
      return handler();
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('optional speechPhonemes: corpus loading', () => {
  it('keeps a card that ships no speechPhonemes, still requiring id/promptEn/answerZh/pinyin', async () => {
    stubCorpusFetch(() =>
      Response.json({
        cards: [
          // No phonemes: browser-voice card, must be kept.
          { id: 'x1', lessonId: 'L', promptEn: 'to eat', answerZh: '吃', pinyin: 'chi1' },
          // Missing pinyin: still unusable, must be dropped.
          { id: 'x2', lessonId: 'L', promptEn: 'no pinyin', answerZh: '水' },
        ],
      }),
    );

    const loaded = await fetchMandarinCorpus();
    expect(loaded.cards.map((card) => card.id)).toEqual(['x1']);
    expect(loaded.cards[0].speechPhonemes).toBeUndefined();
  });

  it('loads the shipped HSK corpus: card_count matches, no card ships phonemes, units parse', async () => {
    stubCorpusFetch(() => new Response(shippedCorpus, { headers: { 'content-type': 'application/json' } }));

    const parsed = JSON.parse(shippedCorpus) as { card_count: number };
    const loaded = await fetchMandarinCorpus();

    expect(loaded.cardCount).toBe(parsed.card_count);
    expect(loaded.cards.length).toBe(parsed.card_count);
    expect(loaded.cards.length).toBeGreaterThan(1000);
    // A prebuilt-audio corpus: not one card carries neural phonemes.
    expect(loaded.cards.every((card: Card) => card.speechPhonemes === undefined)).toBe(true);
    // HSK levels in order, then the Preply tutor-lesson track.
    expect(loaded.units?.map((unit) => unit.title)).toEqual(['HSK 1', 'HSK 2', 'HSK 3', 'Preply Tutoring']);
    expect(loaded.units?.every((unit) => unit.lessons.length > 0)).toBe(true);
  });

  it('still throws when the corpus file is absent, so the caller can fall back to the demo deck', async () => {
    stubCorpusFetch(() => new Response('Not found', { status: 404 }));
    await expect(fetchMandarinCorpus()).rejects.toThrow();
  });
});

describe('optional speechPhonemes: playback', () => {
  let utterances: { text: string }[];
  let speakSpy: ReturnType<typeof vi.fn>;
  let workerSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    utterances = [];
    class FakeUtterance {
      text: string;
      voice: unknown = null;
      lang = '';
      rate = 1;
      pitch = 1;
      onerror: unknown = null;
      constructor(text: string) {
        this.text = text;
        utterances.push(this);
      }
    }
    speakSpy = vi.fn();
    workerSpy = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    vi.stubGlobal('Worker', workerSpy);
    vi.stubGlobal('speechSynthesis', {
      getVoices: () => [{ name: 'Fake Chinese', lang: 'zh-CN', default: true }],
      cancel: vi.fn(),
      speak: speakSpy,
    });
  });

  it('speaks a no-phoneme card with the browser voice and never starts the neural engine', async () => {
    const card: Card = { id: 'hsk1-0001', lessonId: 'HSK_1_Words_1_to_25', promptEn: 'to love', answerZh: '爱', pinyin: 'ai4' };
    const controller = new SpeechController(new PracticeSettings(), () => card);

    await controller.speakAnswer();

    expect(speakSpy).toHaveBeenCalledTimes(1);
    expect(utterances.at(-1)?.text).toBe('爱');
    expect(controller.status).toBe('fallback');
    expect(controller.lastAudioVoice).toContain('browser');
    // The neural path was skipped entirely: no speech Worker was ever created.
    expect(workerSpy).not.toHaveBeenCalled();
    controller.dispose();
  });
});
