import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MandarinPractice from '../src/lib/mandarin/MandarinPractice.svelte';

// Session-flow contract: practice runs as bounded sessions (~15 cards) ending
// in an honest summary (cards done, accuracy from the user's own ratings, day
// streak, what's due next) with a keep-going option. Rating semantics and the
// SRS scheduler are untouched.

const greetingCards = Array.from({ length: 20 }, (_, index) => ({
  id: `greet-${index}`,
  lessonId: 'HSK1_01_Greetings',
  promptEn: `Greeting prompt ${index}?`,
  answerZh: `你好${index}。`,
  pinyin: 'ni3 hao3.',
  speechPhonemes: 'ni3hao3.',
}));

const tutorCards = [
  {
    id: 'tutor-a',
    lessonId: 'Tutor_260525',
    promptEn: 'Tutor prompt A?',
    answerZh: '茶。',
    pinyin: 'cha2.',
    speechPhonemes: 'cha2.',
  },
  {
    id: 'tutor-b',
    lessonId: 'Tutor_260525',
    promptEn: 'Tutor prompt B?',
    answerZh: '水。',
    pinyin: 'shui3.',
    speechPhonemes: 'shui3.',
  },
];

const corpusCards = [...greetingCards, ...tutorCards];

function stubCorpusFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/mandarin-source.json') return new Response('Not found', { status: 404 });
      return Response.json({ card_count: corpusCards.length, lesson_count: 2, cards: corpusCards });
    }),
  );
}

async function enterPractice(buttonName: string) {
  await waitFor(() => expect(screen.getByRole('button', { name: buttonName })).toBeInTheDocument());
  await fireEvent.click(screen.getByRole('button', { name: buttonName }));
  // Disable auto-speak so Reveal never spawns the speech Worker in jsdom.
  await fireEvent.click(screen.getByLabelText('Audio'));
}

async function rateOnce(rating: 'Again' | 'Hard' | 'Correct') {
  await fireEvent.click(await screen.findByRole('button', { name: /Reveal/ }));
  await fireEvent.click(await screen.findByRole('button', { name: rating }));
}

function summary() {
  return screen.queryByLabelText('Session summary');
}

beforeEach(() => {
  window.history.replaceState({}, '', '/mandarin');
  window.localStorage.clear();
  stubCorpusFetch();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mandarin session flow', () => {
  it('a short unit session ends in a summary with an honest tally, recycling failed cards first', async () => {
    render(MandarinPractice);

    await enterPractice('Practice May 25');
    // Rating semantics unchanged: an "Again" card stays due and comes back
    // around, so the queue only empties once everything is rated correct.
    await rateOnce('Again');
    expect(summary()).toBeNull();
    await rateOnce('Correct');
    expect(summary()).toBeNull();
    await rateOnce('Correct');

    const panel = await screen.findByLabelText('Session summary');
    expect(within(panel).getByText('cards done').previousElementSibling).toHaveTextContent('3');
    expect(within(panel).getByText(/correct/).previousElementSibling).toHaveTextContent('67%');
    // Cards were rated today, so today counts toward the streak.
    expect(within(panel).getByText('day streak').previousElementSibling).toHaveTextContent('1');
  });

  it('pauses at the batch boundary, keeps going on Enter, and summarizes queue exhaustion', async () => {
    render(MandarinPractice);

    await enterPractice('Practice Greetings');
    for (let index = 0; index < 15; index += 1) {
      await rateOnce('Correct');
    }

    let panel = await screen.findByLabelText('Session summary');
    expect(within(panel).getByText('cards done').previousElementSibling).toHaveTextContent('15');

    // Keyboard: Enter continues the session with another batch.
    await fireEvent.keyDown(window, { key: 'Enter' });
    expect(summary()).toBeNull();

    for (let index = 0; index < 5; index += 1) {
      await rateOnce('Correct');
    }
    panel = await screen.findByLabelText('Session summary');
    expect(within(panel).getByText('cards done').previousElementSibling).toHaveTextContent('20');
    // The whole unit is scheduled ahead now; the outlook says when.
    expect(within(panel).getByText(/next 20 reviews on/)).toBeInTheDocument();
    // Nothing left in this queue: no keep-going, back to course instead.
    expect(within(panel).queryByRole('button', { name: 'Keep going' })).not.toBeInTheDocument();
    await fireEvent.click(within(panel).getByRole('button', { name: 'Back to course' }));
    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it("an 'all'-mode session (nothing due) still reaches its summary at the planned count", async () => {
    // Both tutor cards already scheduled far ahead: startUnit falls back to
    // 'all' mode, where rated cards never leave the queue — the summary must
    // trigger off the planned count, not queue exhaustion.
    window.localStorage.setItem(
      'mandarin-practice-demo-state-v2',
      JSON.stringify({
        'tutor-a': { attempts: 2, correct: 2, misses: 0, streak: 2, intervalDays: 8, due: '2099-01-01' },
        'tutor-b': { attempts: 2, correct: 2, misses: 0, streak: 2, intervalDays: 8, due: '2099-01-01' },
      }),
    );
    render(MandarinPractice);

    await enterPractice('Practice May 25');
    await rateOnce('Correct');
    expect(summary()).toBeNull();
    await rateOnce('Correct');

    let panel = await screen.findByLabelText('Session summary');
    expect(within(panel).getByText('cards done').previousElementSibling).toHaveTextContent('2');

    // Keep going after a full pass plans a real re-review pass — not a
    // degenerate one-card batch that bounces straight back to the summary.
    await fireEvent.click(within(panel).getByRole('button', { name: 'Keep going' }));
    await rateOnce('Correct');
    expect(summary()).toBeNull();
    await rateOnce('Correct');
    panel = await screen.findByLabelText('Session summary');
    expect(within(panel).getByText('cards done').previousElementSibling).toHaveTextContent('4');
  });

  it('browser Back from a summary returns to the course home', async () => {
    render(MandarinPractice);

    await enterPractice('Practice May 25');
    await rateOnce('Correct');
    await rateOnce('Correct');
    await screen.findByLabelText('Session summary');

    window.history.replaceState({}, '', '/mandarin');
    await fireEvent(window, new PopStateEvent('popstate'));

    expect(await screen.findByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('clicking a queue card on the summary resumes practice at that card', async () => {
    render(MandarinPractice);

    await enterPractice('Practice Greetings');
    for (let index = 0; index < 15; index += 1) {
      await rateOnce('Correct');
    }
    await screen.findByLabelText('Session summary');

    const queue = screen.getByLabelText('Cards in current session');
    await fireEvent.click(within(queue).getAllByRole('button')[0]);

    expect(summary()).toBeNull();
    expect(await screen.findByRole('button', { name: /Reveal/ })).toBeInTheDocument();
  });

  it('extends an existing day streak', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    window.localStorage.setItem('mandarin-practice-days-v1', JSON.stringify([yesterday.toISOString().slice(0, 10)]));

    render(MandarinPractice);

    await enterPractice('Practice May 25');
    await rateOnce('Correct');
    await rateOnce('Correct');

    const panel = await screen.findByLabelText('Session summary');
    expect(within(panel).getByText('day streak').previousElementSibling).toHaveTextContent('2');
  });

  it('hides the tone tiles (the answer) until the learner reveals', async () => {
    render(MandarinPractice);

    await enterPractice('Practice May 25');
    await screen.findByRole('button', { name: /Reveal/ });

    const tonePanel = screen.getByText('Tone coach').closest('.pronunciation-panel') as HTMLElement;
    // Pre-reveal: no hanzi tiles, just the explainer.
    expect(within(tonePanel).queryByText('茶')).not.toBeInTheDocument();
    expect(within(tonePanel).getByText(/appears here after you speak or reveal/)).toBeInTheDocument();

    await fireEvent.click(screen.getByRole('button', { name: /Reveal/ }));
    expect(within(tonePanel).getByText('茶')).toBeInTheDocument();
  });

  it('reports an actionable microphone error instead of hanging on Listening', async () => {
    const denied = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(denied) },
    });

    try {
      render(MandarinPractice);

      await enterPractice('Practice May 25');
      await fireEvent.click(await screen.findByRole('button', { name: 'Speak' }));

      await screen.findByText(/Microphone access is blocked/);
      const tonePanel = screen.getByText('Tone coach').closest('.pronunciation-panel') as HTMLElement;
      expect(within(tonePanel).getByText('Error')).toBeInTheDocument();
      expect(within(tonePanel).queryByText('Listening')).not.toBeInTheDocument();
    } finally {
      // @ts-expect-error cleanup of the test-injected property
      delete navigator.mediaDevices;
    }
  });
});
