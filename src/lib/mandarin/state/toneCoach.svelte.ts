// The tone coach: browser speech recognition (segment matching) plus live
// pitch capture and tone-contour assessment, with the derived per-character
// feedback the practice card renders. The honest-feedback rules hold firmly:
// low-evidence sentinel results never paint verdicts, and contour verdicts are
// always framed as experimental.

import {
  alignMandarinSpeechUnits,
  combineRecognitionResults,
  comparePronunciation,
  composeUnitPronunciationFeedback,
  normalizeMandarinText,
  type PronunciationResult,
} from '../../utils/mandarinPronunciation';
import {
  assessmentWindow,
  createSpeechBoundaryState,
  updateSpeechBoundary,
  type SpeechBoundaryState,
} from '../../utils/mandarinSpeechBoundary';
import {
  TONE_FEEDBACK_EXPERIMENTAL,
  assessToneContours,
  describeToneAssessment,
  detectPitchFromTimeDomain,
  expectedToneSyllables,
  toneAssessmentHasVerdict,
  type PitchFrame,
  type ToneAssessmentResult,
  type ToneSyllableResult,
} from '../../utils/mandarinToneAssessment';
import { contrastPairForPinyin, explainPronunciationEvidence } from '../../utils/mandarinContrastPractice';
import { characterUnits, type CharacterUnit } from '../logic/pinyin';
import type { Card } from '../logic/deck';

export type RecognitionState =
  | 'idle'
  | 'listening'
  | 'matched'
  | 'close'
  | 'missed'
  | 'no_speech'
  | 'unscored'
  | 'unsupported'
  | 'error';

export type CharacterFeedback = CharacterUnit & {
  status: 'pending' | 'active' | 'matched' | 'close' | 'missed' | 'unverified';
  marker: string;
  detail: string;
  observed: string | null;
  toneResult: ToneSyllableResult | null;
};

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionEventLike = {
  results: Iterable<Iterable<{ transcript: string; confidence?: number }>>;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export class ToneCoachController {
  recognitionActive = $state(false);
  recognitionResult = $state<(PronunciationResult & { transcript: string; confidence: number }) | null>(null);
  recognitionError = $state('');
  microphoneAvailable = $state(false);
  textRecognitionAvailable = $state(false);
  toneAssessmentActive = $state(false);
  toneAssessment = $state<ToneAssessmentResult | null>(null);
  toneError = $state('');
  /** True while the browser's microphone permission prompt is outstanding. */
  micPending = $state(false);
  toneHintVisible = $state(false);
  liveToneDurationSeconds = $state(0);
  liveSyllableIndex = $state(0);

  #recognitionInstance: SpeechRecognitionLike | null = null;
  #micRequestSeq = 0;
  #audioContext: AudioContext | null = null;
  #audioStream: MediaStream | null = null;
  #captureTimer: number | null = null;
  #stopTimer: number | null = null;
  #capturedFrames: PitchFrame[] = [];
  #speechBoundary: SpeechBoundaryState = createSpeechBoundaryState();

  readonly #getCard: () => Card | null;
  readonly #getShowAnswer: () => boolean;

  constructor(getCard: () => Card | null, getShowAnswer: () => boolean) {
    this.#getCard = getCard;
    this.#getShowAnswer = getShowAnswer;
  }

  characterFeedback = $derived.by((): CharacterFeedback[] => {
    const card = this.#getCard() ?? null;
    const units = characterUnits(card);
    const transcript = this.recognitionResult?.transcript ?? '';
    const alignment = alignMandarinSpeechUnits(card?.answerZh ?? '', transcript);
    return units.map((unit) => {
      const rawToneResult = unit.toneIndex === null ? null : (this.toneAssessment?.syllables[unit.toneIndex] ?? null);
      // Tone-contour evidence only counts when capture is live or the assessor
      // actually compared contours: low-evidence sentinel results must not
      // paint per-character tone verdicts. Segment matching (transcript
      // alignment) is validated and always kept.
      const toneResult =
        this.toneAssessment && (this.toneAssessmentActive || toneAssessmentHasVerdict(this.toneAssessment)) ? rawToneResult : null;
      let status: CharacterFeedback['status'] = 'pending';
      let detail = unit.tone && unit.tone !== 5 ? `tone ${unit.tone}` : 'neutral';

      if (this.toneAssessmentActive && unit.toneIndex === this.liveSyllableIndex) {
        status = 'active';
        detail = 'listening';
      } else {
        const feedback = composeUnitPronunciationFeedback({
          observed: alignment.observed[unit.unitIndex] ?? null,
          hasTranscript: Boolean(normalizeMandarinText(transcript)),
          tone: toneResult,
        });
        status = feedback.status;
        detail = feedback.detail;
      }

      const marker =
        status === 'matched' ? '✓' : status === 'close' ? '~' : status === 'missed' ? '!' : status === 'unverified' ? '?' : status === 'active' ? '•' : '';
      return {
        ...unit,
        status,
        marker,
        detail,
        observed: alignment.observed[unit.unitIndex] ?? null,
        toneResult,
      };
    });
  });

  explanationUnit = $derived(this.characterFeedback.find((item) => ['missed', 'close', 'unverified'].includes(item.status)) ?? null);
  contrastPair = $derived(this.explanationUnit ? contrastPairForPinyin(this.explanationUnit.pinyin) : null);
  explanation = $derived.by(() => {
    const unit = this.explanationUnit;
    if (!unit || (!this.toneAssessment && !this.recognitionResult && !this.recognitionError)) return null;
    return explainPronunciationEvidence({
      expectedUnit: unit.text,
      expectedPinyin: unit.pinyin,
      observedUnit: unit.observed,
      recognitionAvailable: this.textRecognitionAvailable,
      hasTranscript: Boolean(normalizeMandarinText(this.recognitionResult?.transcript ?? '')),
      toneStatus: unit.toneResult?.status ?? null,
    });
  });

  recognitionState = $derived<RecognitionState>(
    this.toneAssessmentActive
      ? 'listening'
      : this.toneAssessment?.status
        ? this.toneAssessment.status === 'no_speech' || toneAssessmentHasVerdict(this.toneAssessment)
          ? this.toneAssessment.status
          : // Low-evidence sentinel: never label an unjudged attempt with a
            // verdict word like "Close" or "Missed".
            'unscored'
        : this.recognitionActive
          ? 'listening'
          : this.toneError || this.recognitionError
            ? 'error'
            : this.microphoneAvailable
              ? 'idle'
              : 'unsupported',
  );

  recognitionLabel = $derived(
    {
      idle: 'Ready',
      listening: 'Listening',
      matched: 'Matched',
      close: 'Close',
      missed: 'Missed',
      no_speech: 'No speech',
      unscored: 'Not judged',
      unsupported: 'Unsupported',
      error: 'Error',
    }[this.recognitionState],
  );

  recognitionDetail = $derived.by(() => {
    // Permission wait is not "listening": say what is actually happening.
    if (this.micPending) return 'Waiting for microphone permission - allow it to get tone feedback.';
    // Live guidance wins while capture is running: interim assessments are
    // recomputed on partial audio every frame and must never read as verdicts.
    if (this.toneAssessmentActive) return 'Speak naturally. The highlighted tile follows the current syllable.';
    if (this.toneAssessment) {
      // Honest-feedback rule: tone contours are an unvalidated, experimental
      // estimate, so describe them qualitatively - never as a numeric score.
      const textSignal = this.recognitionResult?.transcript ? ` Text heard: ${this.recognitionResult.transcript}` : '';
      return `${describeToneAssessment(this.toneAssessment)}${textSignal}`;
    }
    if (this.toneError || this.recognitionError) return this.toneError || this.recognitionError;
    if (!this.microphoneAvailable) return 'Manual rating is still available.';
    return this.#getShowAnswer() ? 'Use Speak again or rate the card.' : 'Speak the Mandarin answer, then reveal when ready.';
  });

  // Italicize only actual contour verdicts: no_speech / insufficient-audio
  // guidance is not an experimental claim and must stay plainly readable.
  detailExperimental = $derived(
    TONE_FEEDBACK_EXPERIMENTAL && !this.toneAssessmentActive && this.toneAssessment !== null && toneAssessmentHasVerdict(this.toneAssessment),
  );

  init() {
    this.microphoneAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
    this.textRecognitionAvailable = Boolean(this.#recognitionConstructor());
  }

  #recognitionConstructor(): SpeechRecognitionConstructor | null {
    if (typeof window === 'undefined') return null;
    const speechWindow = window as Window &
      typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
    return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
  }

  stopRecognition() {
    if (!this.#recognitionInstance) {
      this.recognitionActive = false;
      return;
    }

    try {
      this.#recognitionInstance.stop();
    } catch {
      // Some browsers throw if recognition has already ended.
    }
    this.recognitionActive = false;
  }

  reset() {
    this.stopRecognition();
    this.stopToneAssessment(false);
    this.micPending = false;
    this.recognitionResult = null;
    this.recognitionError = '';
    this.toneAssessment = null;
    this.toneError = '';
    this.liveToneDurationSeconds = 0;
    this.liveSyllableIndex = 0;
  }

  #startTextRecognition() {
    const card = this.#getCard();
    if (!card) return;

    const Recognition = this.#recognitionConstructor();

    if (!Recognition) {
      return;
    }

    const recognizer = new Recognition();
    recognizer.lang = 'zh-CN';
    recognizer.interimResults = true;
    recognizer.continuous = true;
    recognizer.maxAlternatives = 3;
    this.#recognitionInstance = recognizer;
    this.recognitionActive = true;

    recognizer.onresult = (event) => {
      // Identity guard: recognition events are async, so a trailing event
      // arriving after the user moved on must not synthesize a result against
      // the NEW card - that would flip the tile gate and leak the next
      // card's answer pre-reveal.
      const liveCard = this.#getCard();
      if (!liveCard || liveCard.id !== card.id) return;
      const { transcript, confidence } = combineRecognitionResults(event.results);
      this.recognitionResult = {
        ...comparePronunciation(liveCard.answerZh, transcript),
        transcript,
        confidence,
      };
    };
    recognizer.onerror = (event) => {
      this.recognitionError = event.error || 'Recognition failed.';
      this.recognitionActive = false;
    };
    recognizer.onend = () => {
      this.recognitionActive = false;
      const liveCard = this.#getCard();
      if (!liveCard || liveCard.id !== card.id) return;
      if (!this.recognitionResult && !this.recognitionError) {
        this.recognitionResult = {
          ...comparePronunciation(liveCard.answerZh, ''),
          transcript: '',
          confidence: 0,
        };
      }
    };

    try {
      recognizer.start();
    } catch (error) {
      this.recognitionActive = false;
      this.recognitionError = error instanceof Error ? error.message : 'Recognition failed.';
    }
  }

  async startAssessment() {
    const card = this.#getCard();
    if (!card) return;

    this.reset();
    this.#startTextRecognition();

    if (!navigator.mediaDevices?.getUserMedia) {
      this.microphoneAvailable = false;
      this.toneError = 'Microphone capture is not supported in this browser.';
      return;
    }

    // Permission prompts can outlive the card and resolve out of order.
    // Every continuation below first proves it is still the latest request
    // for the card on screen - a stale continuation must not touch shared
    // state (it would clobber a newer capture's stream and leak its tracks).
    const requestToken = ++this.#micRequestSeq;
    const isStale = () => requestToken !== this.#micRequestSeq || (this.#getCard()?.id ?? null) !== card.id;

    try {
      this.micPending = true;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      if (isStale()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.micPending = false;
      this.microphoneAvailable = true;
      this.#audioStream = stream;

      this.#audioContext = new AudioContext();
      const audioContext = this.#audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      const expectedTones = expectedToneSyllables(card.pinyin);
      const samples = new Float32Array(analyser.fftSize);
      const startTime = audioContext.currentTime;
      const maximumDurationMs = Math.min(8000, Math.max(4500, expectedTones.length * 700 + 2000));
      this.liveToneDurationSeconds = Math.max(0.8, expectedTones.length * 0.38);
      this.liveSyllableIndex = 0;
      this.#capturedFrames = [];
      this.#speechBoundary = createSpeechBoundaryState();
      this.toneAssessmentActive = true;
      this.toneAssessment = assessToneContours(card.pinyin, this.#capturedFrames, {
        durationSeconds: this.liveToneDurationSeconds,
        live: true,
      });

      this.#captureTimer = window.setInterval(() => {
        if (!this.#audioContext) return;
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
        const elapsed = audioContext.currentTime - startTime;
        const frame = {
          time: elapsed,
          rms,
          pitch: detectPitchFromTimeDomain(samples, audioContext.sampleRate),
        };
        this.#capturedFrames.push(frame);

        const boundaryUpdate = updateSpeechBoundary(this.#speechBoundary, frame, expectedTones.length);
        this.#speechBoundary = boundaryUpdate.state;
        const speechStartedAt = this.#speechBoundary.speechStartedAt;
        const speechElapsed = speechStartedAt === null ? 0 : Math.max(0, elapsed - speechStartedAt);
        const secondsPerSyllable = this.liveToneDurationSeconds / Math.max(expectedTones.length, 1);
        this.liveSyllableIndex = Math.min(Math.max(expectedTones.length - 1, 0), Math.floor(speechElapsed / secondsPerSyllable));
        const liveFrames =
          speechStartedAt === null
            ? []
            : this.#capturedFrames
                .filter((capturedFrame) => capturedFrame.time >= Math.max(0, speechStartedAt - 0.08))
                .map((capturedFrame) => ({
                  ...capturedFrame,
                  time: capturedFrame.time - Math.max(0, speechStartedAt - 0.08),
                }));
        this.toneAssessment = assessToneContours(card.pinyin, liveFrames, {
          durationSeconds: this.liveToneDurationSeconds,
          live: true,
        });

        if (boundaryUpdate.shouldStop) this.stopToneAssessment(true);
      }, 40);

      this.#stopTimer = window.setTimeout(() => this.stopToneAssessment(true), maximumDurationMs);
    } catch (error) {
      // A stale request's failure is not news about the current attempt.
      if (isStale()) return;
      // Fail visibly and consistently: text recognition may already be
      // running, and leaving it active would show a contradictory
      // "Listening" status next to a microphone error forever.
      this.micPending = false;
      this.toneAssessmentActive = false;
      this.microphoneAvailable = false;
      this.stopRecognition();
      const name = error instanceof Error ? error.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        this.toneError = 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again - manual rating still works.';
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        this.toneError = 'No microphone was found, so the tone coach is off. Practice and manual rating still work.';
      } else {
        this.toneError = error instanceof Error ? error.message : 'Microphone permission failed.';
      }
    }
  }

  stopToneAssessment(analyze: boolean) {
    if (this.#captureTimer !== null) {
      window.clearInterval(this.#captureTimer);
      this.#captureTimer = null;
    }
    if (this.#stopTimer !== null) {
      window.clearTimeout(this.#stopTimer);
      this.#stopTimer = null;
    }

    const frames = this.#capturedFrames;
    const wasActive = this.toneAssessmentActive;
    this.#capturedFrames = [];
    this.toneAssessmentActive = false;
    this.#audioStream?.getTracks().forEach((track) => track.stop());
    this.#audioStream = null;
    void this.#audioContext?.close();
    this.#audioContext = null;

    const card = this.#getCard();
    if (analyze && card) {
      this.stopRecognition();
      this.toneAssessment = assessToneContours(card.pinyin, assessmentWindow(frames));
    } else if (wasActive) {
      // Aborted mid-capture (e.g. Reveal): the interim assessment was computed
      // on partial audio and must not linger as if it were a finished verdict.
      this.toneAssessment = null;
    }
  }
}
