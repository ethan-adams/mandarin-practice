<script lang="ts">
  import ToneCoachPanel from '../lib/mandarin/components/ToneCoachPanel.svelte';
  import { ToneCoachController } from '../lib/mandarin/state/toneCoach.svelte';
  import type { Card } from '../lib/mandarin/logic/deck';
  import type { ToneAssessmentResult, ToneSyllableResult } from '../lib/utils/mandarinToneAssessment';
  import type { PronunciationResult } from '../lib/utils/mandarinPronunciation';

  type Reco = PronunciationResult & { transcript: string; confidence: number };

  const card = (answerZh: string, pinyin: string): Card => ({
    id: 'h',
    lessonId: 'l',
    promptEn: 'prompt',
    answerZh,
    pinyin,
  });

  const syllable = (
    text: string,
    tone: number,
    observed: ToneSyllableResult['observed'],
    status: ToneSyllableResult['status'],
  ): ToneSyllableResult => ({
    text,
    tone,
    observed,
    score: status === 'matched' ? 88 : status === 'close' ? 66 : 40,
    status,
    startHz: 200,
    endHz: 200,
  });

  const assessment = (status: ToneAssessmentResult['status'], syllables: ToneSyllableResult[]): ToneAssessmentResult => ({
    status,
    score: status === 'matched' ? 88 : status === 'close' ? 66 : 40,
    voicedFrameCount: 14,
    syllables,
  });

  const reco = (status: PronunciationResult['status'], expected: string, transcript: string): Reco => ({
    status,
    normalized_expected: expected,
    normalized_transcript: transcript,
    similarity: status === 'matched' ? 1 : 0.15,
    transcript,
    confidence: 1,
  });

  function make(answerZh: string, pinyin: string, setup: (controller: ToneCoachController) => void): ToneCoachController {
    const controller = new ToneCoachController(() => card(answerZh, pinyin), () => true);
    controller.wordCheckEnabled = true;
    controller.microphoneAvailable = true;
    setup(controller);
    return controller;
  }

  const states: { label: string; note: string; revealed: boolean; controller: ToneCoachController }[] = [
    {
      label: 'Idle (before speaking)',
      note: 'answer stays hidden',
      revealed: false,
      controller: make('爱', 'ài', () => {}),
    },
    {
      label: 'Listening',
      note: 'mic capturing',
      revealed: false,
      controller: make('爱', 'ài', (c) => {
        c.toneAssessmentActive = true;
      }),
    },
    {
      label: 'Word right + tone right',
      note: '爱 spoken well',
      revealed: true,
      controller: make('爱', 'ài', (c) => {
        c.recognitionResult = reco('matched', '爱', '爱');
        c.toneAssessment = assessment('matched', [syllable('爱', 4, 'falling', 'matched')]);
      }),
    },
    {
      label: 'Reported case: single-syllable read-back miss + tone off',
      note: 'heard 呃 for 爱, said it rising',
      revealed: true,
      controller: make('爱', 'ài', (c) => {
        c.recognitionResult = reco('missed', '爱', '呃');
        c.toneAssessment = assessment('missed', [syllable('爱', 4, 'rising', 'missed')]);
      }),
    },
    {
      label: 'Multi-syllable, tone close',
      note: '老师, per-syllable dots',
      revealed: true,
      controller: make('老师', 'lǎoshī', (c) => {
        c.recognitionResult = reco('matched', '老师', '老师');
        c.toneAssessment = assessment('close', [syllable('老', 3, 'dipping', 'matched'), syllable('师', 1, 'level', 'close')]);
      }),
    },
    {
      label: 'Word check offline',
      note: 'server down, tone only',
      revealed: true,
      controller: make('爱', 'ài', (c) => {
        c.wordCheckEnabled = false;
        c.textRecognitionAvailable = false;
        c.toneAssessment = assessment('close', [syllable('爱', 4, 'falling', 'close')]);
      }),
    },
    {
      label: 'Microphone blocked',
      note: 'actionable error, not a hang',
      revealed: false,
      controller: make('爱', 'ài', (c) => {
        c.toneError =
          'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again - manual rating still works.';
      }),
    },
  ];
</script>

<main>
  <h1>Tone coach · verdict card states</h1>
  <div class="grid">
    {#each states as state, i}
      <section id={`shot-${i}`}>
        <header>
          <strong>{state.label}</strong>
          <span>{state.note}</span>
        </header>
        <ToneCoachPanel toneCoach={state.controller} answerRevealed={state.revealed} />
      </section>
    {/each}
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    padding: 24px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-family: var(--font-sans, system-ui, sans-serif);
  }

  h1 {
    margin: 0 0 20px;
    font-size: 18px;
    font-weight: 800;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(420px, 1fr));
    gap: 22px;
    align-items: start;
    max-width: 1320px;
  }

  section {
    padding: 16px;
    border: 1px solid var(--border-primary);
    border-radius: 12px;
    background: var(--bg-primary);
  }

  header {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 4px;
  }

  header strong {
    font-size: 13px;
    font-weight: 800;
  }

  header span {
    color: var(--text-tertiary);
    font-size: 12px;
  }
</style>
