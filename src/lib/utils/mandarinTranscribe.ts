// Server-side Mandarin word recognition. Uploads a short recorded clip to
// mandarin-api (`POST /v1/transcribe`), which runs faster-whisper on the box and
// returns simplified-hanzi text. Replaces the old on-device Whisper path
// (transformers.js) — see VISION.md "Pronunciation" (2026-08-20 pivot).

import { API_BASE } from '../config';

/** True when the server is configured; word check is unavailable without it. */
export function transcriptionAvailable(): boolean {
  return Boolean(API_BASE);
}

/**
 * Transcribe a recorded audio clip to simplified Mandarin text. Throws if the
 * server is not configured or the request fails, so the caller can fall back to
 * tone feedback and say so honestly.
 */
export async function transcribeClip(blob: Blob): Promise<string> {
  if (!API_BASE) throw new Error('Transcription server is not configured');
  const form = new FormData();
  form.append('clip', blob, 'clip.webm');
  const response = await fetch(`${API_BASE}/v1/transcribe`, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`Transcription failed (${response.status})`);
  const data = (await response.json()) as { text?: string };
  return (data.text ?? '').trim();
}
