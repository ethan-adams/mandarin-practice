import type { PitchFrame } from './mandarinToneAssessment';

export type SpeechBoundaryState = {
  noiseFloor: number;
  consecutiveSpeechFrames: number;
  speechStartedAt: number | null;
  lastSpeechAt: number | null;
};

export type SpeechBoundaryUpdate = {
  state: SpeechBoundaryState;
  shouldStop: boolean;
};

const minimumRms = 0.012;
const frameSeconds = 0.04;

export function createSpeechBoundaryState(): SpeechBoundaryState {
  return {
    noiseFloor: 0.006,
    consecutiveSpeechFrames: 0,
    speechStartedAt: null,
    lastSpeechAt: null,
  };
}

export function updateSpeechBoundary(
  previous: SpeechBoundaryState,
  frame: PitchFrame,
  expectedSyllables: number,
): SpeechBoundaryUpdate {
  const speechThreshold = Math.max(minimumRms, previous.noiseFloor * 2.2);
  const pitchConfirmsSpeech = frame.pitch !== null && frame.rms >= minimumRms;
  const isSpeech = pitchConfirmsSpeech || frame.rms >= speechThreshold;
  const consecutiveSpeechFrames = isSpeech ? previous.consecutiveSpeechFrames + 1 : 0;
  const speechConfirmed = consecutiveSpeechFrames >= 2;
  const speechStartedAt =
    previous.speechStartedAt ?? (speechConfirmed ? Math.max(0, frame.time - frameSeconds) : null);
  const lastSpeechAt = isSpeech && speechStartedAt !== null ? frame.time : previous.lastSpeechAt;
  const noiseFloor =
    speechStartedAt === null && !isSpeech
      ? previous.noiseFloor * 0.82 + Math.min(frame.rms, speechThreshold) * 0.18
      : previous.noiseFloor;

  const trailingSilenceSeconds = Math.min(0.62, 0.48 + Math.max(0, expectedSyllables - 2) * 0.02);
  const minimumSpeechSeconds = Math.min(0.8, Math.max(0.2, expectedSyllables * 0.08));
  const speechDuration = speechStartedAt !== null && lastSpeechAt !== null ? lastSpeechAt - speechStartedAt : 0;
  const shouldStop =
    speechStartedAt !== null &&
    lastSpeechAt !== null &&
    speechDuration >= minimumSpeechSeconds &&
    frame.time - lastSpeechAt >= trailingSilenceSeconds;

  return {
    state: {
      noiseFloor,
      consecutiveSpeechFrames,
      speechStartedAt,
      lastSpeechAt,
    },
    shouldStop,
  };
}

export function assessmentWindow(frames: PitchFrame[]) {
  const voiced = frames.filter((frame) => frame.pitch !== null && frame.rms >= minimumRms);
  if (!voiced.length) return frames;

  const start = Math.max(0, voiced[0].time - 0.08);
  const end = voiced.at(-1)!.time + 0.12;
  return frames
    .filter((frame) => frame.time >= start && frame.time <= end)
    .map((frame) => ({ ...frame, time: frame.time - start }));
}
