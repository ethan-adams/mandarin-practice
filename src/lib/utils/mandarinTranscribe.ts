// Server-side Mandarin word recognition AND tone assessment. Uploads a short
// recorded clip to mandarin-api (`POST /v1/transcribe`), which runs faster-whisper
// on the box and returns simplified-hanzi text plus — when the card's expected
// tones are sent — the learner's pitch contour and a per-syllable tone verdict
// from a real server-side F0 tracker. Replaces the on-device Whisper path AND the
// unreliable in-browser pitch detector — see VISION.md "Pronunciation" (2026-08-20
// pivot) and the 2026-08-23 tone rework.

import { API_BASE } from '../config';

/** True when the server is configured; word check is unavailable without it. */
export function transcriptionAvailable(): boolean {
  return Boolean(API_BASE);
}

export type ServerToneSyllable = {
  expected: number;
  observed: 'level' | 'rising' | 'dipping' | 'falling' | 'unvoiced';
  status: 'matched' | 'close' | 'missed' | 'unscored';
  confidence: number;
  /** Softmax confidence of the trained model's tone prediction (absent when the
   *  DSP fallback ran on the box). Gates SRS demotion — a miss only counts when
   *  the model is sure. See eval/scorecards/tone_confidence.json. */
  modelProb?: number;
};

export type ServerTone = {
  status: 'matched' | 'close' | 'missed' | 'no_speech';
  confidence: number;
  voicedFrames: number;
  segmentation: 'whisper' | 'even' | 'none';
  syllables: ServerToneSyllable[];
  /** Learner pitch contour: semitones vs. own median, 24 points. Correlated
   *  against the native reference contour on the client. Empty = not enough
   *  voiced audio to judge. */
  contour: number[];
};

export type TranscribeResult = { text: string; tone: ServerTone | null };

/**
 * Transcribe a recorded audio clip to simplified Mandarin text, and (when
 * `expectedTones` is given) assess tone from the SAME clip in one round trip.
 * Throws if the server is not configured or the request fails, so the caller can
 * fall back to tone feedback and say so honestly.
 */
export async function transcribeClip(blob: Blob, expectedTones?: number[]): Promise<TranscribeResult> {
  if (!API_BASE) throw new Error('Transcription server is not configured');
  const form = new FormData();
  form.append('clip', blob, 'clip.webm');
  if (expectedTones && expectedTones.length) form.append('tones', JSON.stringify(expectedTones));
  const response = await fetch(`${API_BASE}/v1/transcribe`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Transcription failed (${response.status})`);
  const data = (await response.json()) as { text?: string; tone?: ServerTone | null };
  return { text: (data.text ?? '').trim(), tone: data.tone ?? null };
}
