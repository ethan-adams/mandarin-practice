// Spaced-repetition scheduling for the Mandarin learning core. The rating
// transition and localStorage shape are load-bearing compatibility surfaces:
// existing users carry progress under `mandarin-practice-demo-state-v2`
// (with a v1 fallback read), so any change here must migrate explicitly.

export type Rating = 'correct' | 'hard' | 'wrong';

export type CardState = {
  attempts: number;
  correct: number;
  misses: number;
  streak: number;
  intervalDays: number;
  due: string;
};

export const REVIEW_STORAGE_KEY = 'mandarin-practice-demo-state-v2';
export const LEGACY_REVIEW_STORAGE_KEY = 'mandarin-practice-demo-state-v1';

export const today = () => new Date().toISOString().slice(0, 10);

export const addDays = (days: number) => {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
};

export const defaultCardState = (): CardState => ({
  attempts: 0,
  correct: 0,
  misses: 0,
  streak: 0,
  intervalDays: 0,
  due: today(),
});

// The scheduler: correct doubles the interval (capped at 30 days), hard resets
// the streak but keeps the card one day out, wrong brings it due immediately.
export function applyRating(previous: CardState | undefined, rating: Rating): CardState {
  const item = { ...defaultCardState(), ...previous };
  item.attempts += 1;

  if (rating === 'correct') {
    item.correct += 1;
    item.streak += 1;
    item.intervalDays = item.intervalDays < 1 ? 1 : Math.min(item.intervalDays * 2, 30);
  } else if (rating === 'hard') {
    item.misses += 1;
    item.streak = 0;
    item.intervalDays = 1;
  } else {
    item.misses += 1;
    item.streak = 0;
    item.intervalDays = 0;
  }

  item.due = addDays(item.intervalDays);
  return item;
}

export function isDue(state: CardState | undefined) {
  return (state?.due ?? today()) <= today();
}

export function loadReviewState(): Record<string, CardState> {
  try {
    const stored = localStorage.getItem(REVIEW_STORAGE_KEY) ?? localStorage.getItem(LEGACY_REVIEW_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveReviewState(state: Record<string, CardState>) {
  localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state));
}

export function clearReviewState() {
  localStorage.removeItem(REVIEW_STORAGE_KEY);
  localStorage.removeItem(LEGACY_REVIEW_STORAGE_KEY);
}
