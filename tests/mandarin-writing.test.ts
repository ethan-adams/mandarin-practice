import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WritingPractice from '../src/lib/mandarin/components/WritingPractice.svelte';

// hanzi-writer draws to SVG and reads pointer input, so it's mocked: we assert
// the widget mounts a writer per character, advances through the word as each
// character's quiz completes, and lands on the done state after the last one.
const { createMock, getLastQuiz } = vi.hoisted(() => {
  let lastQuiz: { onComplete?: () => void; onMistake?: () => void } | null = null;
  const create = vi.fn(() => ({
    quiz: vi.fn((opts: typeof lastQuiz) => {
      lastQuiz = opts;
    }),
    animateCharacter: vi.fn(() => Promise.resolve()),
  }));
  return { createMock: create, getLastQuiz: () => lastQuiz };
});

vi.mock('hanzi-writer', () => ({ default: { create: createMock } }));

afterEach(() => {
  cleanup();
  createMock.mockClear();
});

const lastCharCreated = () => createMock.mock.calls.at(-1)?.[1];

describe('writing practice', () => {
  it('traces each Han character in order and finishes on the done state', async () => {
    render(WritingPractice, { props: { word: '好你' } });

    await waitFor(() => expect(createMock).toHaveBeenCalled());
    expect(lastCharCreated()).toBe('好');
    expect(screen.getByText('Trace · 1 of 2')).toBeInTheDocument();

    // Finish the first character's quiz -> advance to the second.
    getLastQuiz()?.onComplete?.();
    await waitFor(() => expect(lastCharCreated()).toBe('你'));
    expect(screen.getByText('Trace · 2 of 2')).toBeInTheDocument();

    // Finish the last character -> done state with a trace-again action.
    getLastQuiz()?.onComplete?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trace again' })).toBeInTheDocument());
  });

  it('shows an empty state when there is nothing to trace', () => {
    render(WritingPractice, { props: { word: 'abc 123' } });
    expect(screen.getByText('No characters to trace here.')).toBeInTheDocument();
    expect(createMock).not.toHaveBeenCalled();
  });
});
