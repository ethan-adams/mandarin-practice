import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MandarinPractice from '../src/lib/mandarin/MandarinPractice.svelte';

// Course-home contract: /mandarin opens on a course view (units with progress
// and a Continue action) instead of dropping straight into a wall of toggles.
// Practice stays one tap away and deep links still work.

const corpusCards = [
  {
    id: 'hsk-hello',
    lessonId: 'HSK1_01_Greetings',
    promptEn: 'How would you say: hello?',
    answerZh: '你好。',
    pinyin: 'ni3 hao3.',
    speechPhonemes: 'ni3hao3.',
  },
  {
    id: 'hsk-thanks',
    lessonId: 'HSK1_01_Greetings',
    promptEn: 'How would you say: thank you?',
    answerZh: '谢谢。',
    pinyin: 'xie4 xie.',
    speechPhonemes: 'xie4xie.',
  },
  {
    id: 'tutor-tea',
    lessonId: 'Tutor_260525',
    promptEn: 'How would you say: tea?',
    answerZh: '茶。',
    pinyin: 'cha2.',
    speechPhonemes: 'cha2.',
  },
  {
    id: 'review-water',
    lessonId: 'Review_expanded',
    promptEn: 'How would you say: water?',
    answerZh: '水。',
    pinyin: 'shui3.',
    speechPhonemes: 'shui3.',
  },
];

function stubCorpusFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== '/mandarin-source.json') return new Response('Not found', { status: 404 });
      return Response.json({ card_count: corpusCards.length, lesson_count: 3, cards: corpusCards });
    }),
  );
}

async function findCourseHome() {
  return await screen.findByRole('button', { name: 'Continue' });
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

describe('mandarin course home', () => {
  it('opens on the course view with friendly unit names and never a raw lesson id', async () => {
    render(MandarinPractice);

    await findCourseHome();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Practice Greetings' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Practice May 25' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practice Mixed review' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('Tutor_260525');
    expect(document.body.textContent).not.toContain('HSK1_01_Greetings');
    expect(document.body.textContent).not.toContain('Review_expanded');
  });

  it('shows per-unit progress derived from stored review state', async () => {
    // hsk-hello mastered (14-day interval, not due), hsk-thanks never seen.
    window.localStorage.setItem(
      'mandarin-practice-demo-state-v2',
      JSON.stringify({
        'hsk-hello': { attempts: 5, correct: 5, misses: 0, streak: 5, intervalDays: 14, due: '2099-01-01' },
      }),
    );
    render(MandarinPractice);

    const unit = await screen.findByRole('button', { name: 'Practice Greetings' });
    await waitFor(() => expect(unit).toHaveTextContent('1 of 2 sticking well'));
  });

  it('Continue starts a practice session with the queue visible and no answers leaked', async () => {
    render(MandarinPractice);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Practice Greetings' })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('button', { name: /Reveal/ })).toBeInTheDocument();
    const queue = screen.getByLabelText('Cards in current session');
    expect(within(queue).getByText(corpusCards[0].promptEn)).toBeInTheDocument();
    // Recall practice: the queue must never show a card's hanzi answer.
    for (const card of corpusCards) {
      expect(within(queue).queryByText(card.answerZh)).not.toBeInTheDocument();
    }
  });

  it('a unit card starts practice scoped to that unit', async () => {
    render(MandarinPractice);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Practice Greetings' })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('button', { name: 'Practice Greetings' }));

    const queue = await screen.findByLabelText('Cards in current session');
    expect(within(queue).getByText('How would you say: hello?')).toBeInTheDocument();
    expect(within(queue).getByText('How would you say: thank you?')).toBeInTheDocument();
    expect(within(queue).queryByText('How would you say: tea?')).not.toBeInTheDocument();
    expect(screen.getByText('Greetings', { selector: '.scope-label' })).toBeInTheDocument();
  });

  it('quick modes practice the whole deck even after a unit was scoped', async () => {
    render(MandarinPractice);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Practice Greetings' })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('button', { name: 'Practice Greetings' }));
    await fireEvent.click(await screen.findByRole('button', { name: '← Course' }));
    await fireEvent.click(screen.getByRole('button', { name: /Browse all/ }));

    const queue = await screen.findByLabelText('Cards in current session');
    expect(within(queue).getByText('How would you say: tea?')).toBeInTheDocument();
    expect(screen.getByText('All lessons', { selector: '.scope-label' })).toBeInTheDocument();
  });

  it('back to course returns to the home view', async () => {
    render(MandarinPractice);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Practice Greetings' })).toBeInTheDocument());
    await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.click(await screen.findByRole('button', { name: '← Course' }));

    expect(await findCourseHome()).toBeInTheDocument();
    expect(window.location.pathname).toBe('/mandarin');
  });

  it('listening practice is reachable from the course home', async () => {
    render(MandarinPractice);

    await findCourseHome();
    await fireEvent.click(screen.getByRole('button', { name: /Listening/ }));

    expect(await screen.findByText('Which phrase did you hear?')).toBeInTheDocument();
  });

  it('prefers deck-provided unit metadata when the corpus ships it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) !== '/mandarin-source.json') return new Response('Not found', { status: 404 });
        return Response.json({
          card_count: corpusCards.length,
          lesson_count: 3,
          cards: corpusCards,
          units: [
            {
              id: 'hsk1',
              title: 'HSK 1',
              order: 1,
              lessons: [{ id: 'HSK1_01_Greetings', title: 'Greetings & Introductions', order: 1 }],
            },
          ],
        });
      }),
    );

    render(MandarinPractice);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Practice Greetings & Introductions' })).toBeInTheDocument(),
    );
    // Lessons the metadata does not cover stay reachable with friendly names.
    expect(screen.getByRole('button', { name: 'Practice May 25' })).toBeInTheDocument();
  });

  it('deep links to a card still open practice directly', async () => {
    window.history.replaceState({}, '', '/mandarin/tutor-tea');
    render(MandarinPractice);

    await waitFor(() => expect(screen.getByText('How would you say: tea?', { selector: '.prompt' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });
});
