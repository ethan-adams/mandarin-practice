import { describe, expect, it } from 'vitest';
import { assessmentWindow, createSpeechBoundaryState, updateSpeechBoundary } from './mandarinSpeechBoundary';
import type { PitchFrame } from './mandarinToneAssessment';

function frame(time: number, rms: number, pitch: number | null = null): PitchFrame {
  return { time, rms, pitch };
}

describe('Mandarin speech boundaries', () => {
  it('stops promptly after a completed phrase and trailing silence', () => {
    let state = createSpeechBoundaryState();
    let shouldStop = false;

    for (let time = 0; time <= 1.8; time += 0.04) {
      const speaking = time >= 0.2 && time <= 1.16;
      const update = updateSpeechBoundary(state, frame(time, speaking ? 0.07 : 0.003, speaking ? 190 : null), 4);
      state = update.state;
      shouldStop = update.shouldStop;
      if (shouldStop) break;
    }

    expect(state.speechStartedAt).toBeCloseTo(0.2, 1);
    expect(shouldStop).toBe(true);
  });

  it('does not stop during a short pause between pronunciation units', () => {
    let state = createSpeechBoundaryState();
    let stoppedDuringPause = false;

    for (let time = 0; time <= 1.6; time += 0.04) {
      const speaking = (time >= 0.12 && time <= 0.6) || (time >= 1 && time <= 1.5);
      const update = updateSpeechBoundary(state, frame(time, speaking ? 0.06 : 0.003, speaking ? 205 : null), 5);
      state = update.state;
      if (time < 1 && update.shouldStop) stoppedDuringPause = true;
    }

    expect(stoppedDuringPause).toBe(false);
  });

  it('removes idle capture time before distributing frames across syllables', () => {
    const frames = [
      frame(0, 0.003),
      frame(0.4, 0.003),
      frame(0.8, 0.08, 180),
      frame(1.2, 0.08, 195),
      frame(1.6, 0.08, 210),
      frame(2, 0.003),
    ];

    const window = assessmentWindow(frames);
    expect(window).toHaveLength(3);
    expect(window[0].time).toBeCloseTo(0.08);
    expect(window.at(-1)?.time).toBeCloseTo(0.88);
  });
});
