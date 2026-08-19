// Plain-module home for the localStorage keys that the sync layer gathers. Kept
// out of the .svelte.ts state modules so pure TypeScript (and its vitest tests)
// can import the key names without pulling Svelte runes through the compiler.
// The SRS and practice-day keys already live in plain modules (logic/srs.ts,
// logic/sessionStats.ts) and are imported from there.

export const listeningStorageKey = 'mandarin-practice-listening-results-v1';
export const listeningCountStorageKey = 'mandarin-practice-listening-count-v1';
export const pronunciationEvidenceStorageKey = 'mandarin-practice-pronunciation-evidence-v1';
