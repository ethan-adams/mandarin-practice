// Voice metadata. The app plays prebuilt, stored audio clips (card.audioUrl,
// served from R2) and falls back to the browser's own Chinese voice — see
// VISION.md "Prebuilt stored audio". The former in-browser Kokoro/onnxruntime
// neural engine and its Web Worker were retired in the 2026-08-19 rethink, so
// this module now only carries the voice identifiers the settings panel keeps.

export const MANDARIN_VOICES = [
  'zf_001',
  'zf_003',
  'zf_005',
  'zf_017',
  'zf_023',
  'zf_032',
  'zm_009',
  'zm_010',
  'zm_011',
  'zm_012',
  'zm_013',
  'zm_014',
] as const;

export type MandarinVoice = (typeof MANDARIN_VOICES)[number];
export type MandarinVoiceMode = 'variety' | 'single';
