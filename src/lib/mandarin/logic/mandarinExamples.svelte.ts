// Reactive loader for the example sentences (public/mandarin-examples.json).
// One fetch per session, cached; lookups are reactive so a card's "In context"
// block fills in as soon as the file lands. See mandarinExamples.ts for the pure
// helpers and scripts/build-examples.mjs for how the data is built.

import type { Example, ExamplesPayload } from './mandarinExamples';

const EXAMPLES_URL = '/mandarin-examples.json';

class ExampleStore {
  #examples = $state<Record<string, Example[]>>({});
  attribution = $state('');
  #requested = false;

  /** Fetch the examples once, best-effort. A failed load is retryable and never
   *  breaks the card — the "In context" block simply stays hidden. */
  load() {
    if (this.#requested) return;
    this.#requested = true;
    fetch(EXAMPLES_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<ExamplesPayload>) : null))
      .then((payload) => {
        if (!payload) return;
        this.#examples = payload.examples ?? {};
        this.attribution = payload.attribution ?? '';
      })
      .catch(() => {
        this.#requested = false;
      });
  }

  /** Example sentences for a word (the card's answer), or [] if none/not loaded. */
  for(word: string): Example[] {
    return (word && this.#examples[word]) || [];
  }
}

export const exampleStore = new ExampleStore();
