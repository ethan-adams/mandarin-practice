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
  type ToneStatus,
  type ToneSyllableResult,
  type ToneSyllableStatus,
} from '../../utils/mandarinToneAssessment';
import { contrastPairForPinyin, explainPronunciationEvidence } from '../../utils/mandarinContrastPractice';
import {
  compareBySyllable,
  compareContours,
  contourFromFrames,
  type ContourComparison,
} from '../../utils/mandarinToneReference';
import { transcribeClip, transcriptionAvailable } from '../../utils/mandarinTranscribe';
import { bestSpokenResult, compareBySound, ensurePinyinLookup } from '../../utils/mandarinSound';
import { characterUnits, pinyinText, type CharacterUnit } from '../logic/pinyin';
import type { Card } from '../logic/deck';

export type WhisperState = 'off' | 'loading' | 'ready' | 'transcribing' | 'error';

/** One plain-language line about how a spoken take landed. `unknown` means the
 *  app genuinely could not tell — never a disguised "wrong". */
export type FeedbackAccent = 'match' | 'near' | 'off' | 'unknown';
export type SpokenVerdict = { status: FeedbackAccent; line: string };

/** The shape a tone should make, in words a beginner can act on. */
function toneShape(tone: number): { name: string; hint: string } {
  switch (tone) {
    case 1:
      return { name: 'high, level', hint: 'hold it flat and high' };
    case 2:
      return { name: 'rising', hint: 'sweep up like a question' };
    case 3:
      return { name: 'dipping', hint: 'dip down, then back up' };
    case 4:
      return { name: 'falling', hint: 'start high and drop sharply' };
    default:
      return { name: 'neutral', hint: 'keep it light and quick' };
  }
}

/** What the learner's pitch actually did, in the same plain vocabulary. */
function observedShapeWord(observed: ToneSyllableResult['observed']): string {
  return {
    level: 'flat',
    rising: 'rising',
    dipping: 'dipping',
    falling: 'falling',
    unvoiced: 'too quietly to read',
  }[observed];
}

/** Reference pitch contours per answerZh, extracted offline from the native
 * clips (factory scripts/gen_contours.py) and shipped as a static JSON. */
const CONTOURS_URL = '/mandarin-contours.json';

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
  recognitionResult = $state<(PronunciationResult & { transcript: string; confidence: number; soundMatch?: boolean }) | null>(null);
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
  /** How the learner's last take compared to the native reference clip. */
  nativeMatch = $state<ContourComparison | null>(null);
  nativeSyllables = $state<ContourComparison[]>([]);
  /** Opt-in word recognition (in-browser Whisper): checks you said the right
   * word, not just the right tone. */
  wordCheckEnabled = $state(false);
  whisperState = $state<WhisperState>('off');
  whisperProgress = $state(0);
  whisperDetail = $state('');

  #contours = $state<Record<string, number[]> | null>(null);
  #contoursRequested = false;
  #recorder: MediaRecorder | null = null;
  #recordedChunks: Blob[] = [];
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

  /** A native reference contour exists for the card on screen. */
  referenceAvailable = $derived.by(() => {
    const answer = this.#getCard()?.answerZh;
    return Boolean(this.#contours && answer && this.#contours[answer]);
  });

  /** Plain-language verdict for the last take vs. the native reference. */
  nativeSummary = $derived.by(() => {
    if (!this.nativeMatch) return null;
    if (this.nativeMatch.status === 'matched') return 'Your pitch closely tracked the native audio.';
    if (this.nativeMatch.status === 'close') return 'Your pitch partly tracked the native audio — replay it and match the melody.';
    return 'Your pitch differed from the native audio — replay it and follow the tone shape.';
  });

  init() {
    this.microphoneAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
    this.textRecognitionAvailable = Boolean(this.#recognitionConstructor());
    // Word check is what tells you whether you said the right word, so it's on
    // by default whenever the server can do it — no toggle to hunt for. Local
    // dev (no API_BASE) quietly falls back to the browser recognizer.
    if (transcriptionAvailable()) void this.enableWordCheck();
    void this.loadContours();
    // Warm the hanzi->reading map so word-check can score by sound, not just by
    // character (homophones must count as correct pronunciation).
    void ensurePinyinLookup();
  }

  /** Score a transcript against the card by BOTH character and sound, keeping the
   *  stronger. A homophone the recognizer picked (哎 for 爱) still scores right. */
  #spokenResult(card: Card, transcript: string, confidence: number) {
    const { result, soundMatch } = bestSpokenResult(
      comparePronunciation(card.answerZh, transcript),
      compareBySound(card.pinyin, transcript),
    );
    return { ...result, transcript, confidence, soundMatch };
  }

  /** True when either recognizer (server word check or the browser's) can
   *  confirm the word — drives the honest "judging by tone only" note. */
  wordAvailable = $derived(this.wordCheckEnabled || this.textRecognitionAvailable);

  /** How you said the word: right word, near word, wrong word, or genuinely
   *  unclear. On a single syllable a read-back miss is treated as unclear, not
   *  wrong — recognizers routinely trip on lone syllables. */
  wordVerdict = $derived.by((): SpokenVerdict | null => {
    const result = this.recognitionResult;
    if (!result) return null;
    const card = this.#getCard();
    const expected = card?.answerZh ?? '';
    const expectedLabel = card ? `${expected} (${pinyinText(card.pinyin)})` : expected;
    const heard = (result.transcript ?? '').trim();
    if (result.status === 'no_speech' || !heard) {
      return { status: 'unknown', line: 'Did not catch any speech. Tap Speak and say it once more.' };
    }
    if (result.status === 'matched') {
      const line = result.soundMatch
        ? `Heard “${heard}”. Same sounds as ${expectedLabel}. Tone is scored separately below.`
        : `Heard “${heard}”. That is the word.`;
      return { status: 'match', line };
    }
    if (result.status === 'close') {
      return { status: 'near', line: `Heard “${heard}”. Nearly ${expectedLabel}.` };
    }
    const expectedUnits = [...expected].filter((ch) => /\p{Script=Han}/u.test(ch)).length;
    if (expectedUnits <= 1) {
      return {
        status: 'unknown',
        line: `Heard “${heard}”. Read-back is unreliable on a single syllable, so trust your ear: hear ${expectedLabel} and compare.`,
      };
    }
    return { status: 'off', line: `Heard “${heard}”. That is not ${expectedLabel}. Hear it and try again.` };
  });

  /** How your tone landed, named as a shape you can act on (and, when the app
   *  can tell, which tone you actually produced). Always hedged as an estimate. */
  toneVerdict = $derived.by((): SpokenVerdict | null => {
    const assessment = this.toneAssessment;
    const hasVerdict = assessment ? toneAssessmentHasVerdict(assessment) : false;
    const overall: ToneStatus | null = hasVerdict ? assessment!.status : (this.nativeMatch?.status ?? null);
    if (!overall) return null;

    const graded = (assessment?.syllables ?? []).filter((syllable) => syllable.tone && syllable.tone !== 5);
    if (hasVerdict && graded.length === 1) {
      const syllable = graded[0];
      const want = toneShape(syllable.tone!);
      const got = observedShapeWord(syllable.observed);
      if (syllable.status === 'matched') {
        return { status: 'match', line: `On target. ${syllable.text} is a ${want.name} tone, and your pitch matched.` };
      }
      if (syllable.status === 'close') {
        return { status: 'near', line: `Close. You said it ${got}; ${syllable.text} should be ${want.name}, so ${want.hint}.` };
      }
      return { status: 'off', line: `You said it ${got}. ${syllable.text} is a ${want.name} tone, so ${want.hint}.` };
    }

    const status: FeedbackAccent = overall === 'matched' ? 'match' : overall === 'close' ? 'near' : 'off';
    const line =
      status === 'match'
        ? 'On target. Your pitch tracked the native melody.'
        : status === 'near'
          ? 'Close. Follow the native melody a little tighter, syllable by syllable.'
          : 'Off. Replay the native audio and match each syllable’s rise and fall.';
    return { status, line };
  });

  /** Per-syllable tone dots for multi-syllable answers (empty for one syllable,
   *  where the tone line already names the shape). */
  toneDots = $derived.by((): ToneSyllableStatus[] => {
    const assessment = this.toneAssessment;
    if (!assessment || !toneAssessmentHasVerdict(assessment) || assessment.syllables.length <= 1) return [];
    return assessment.syllables.map((syllable) => syllable.status);
  });

  /** Border accent for the card: the worse of the two verdicts. */
  feedbackAccent = $derived.by((): FeedbackAccent => {
    const rank: Record<FeedbackAccent, number> = { off: 3, near: 2, unknown: 1, match: 0 };
    const values = [this.wordVerdict?.status, this.toneVerdict?.status].filter(Boolean) as FeedbackAccent[];
    if (!values.length) return 'unknown';
    return values.reduce((worst, next) => (rank[next] > rank[worst] ? next : worst));
  });

  /** Load the native reference contours once, best-effort. Missing data just
   * turns off the reference comparison; tone capture still works. */
  async loadContours() {
    if (this.#contoursRequested) return;
    this.#contoursRequested = true;
    try {
      const response = await fetch(CONTOURS_URL);
      if (!response.ok) return;
      const payload = (await response.json()) as { entries?: Record<string, number[]> };
      if (payload?.entries) this.#contours = payload.entries;
    } catch {
      // Offline or missing file: reference comparison stays off, nothing breaks.
    }
  }

  #referenceContour(card: Card | null): number[] | null {
    if (!card || !this.#contours) return null;
    return this.#contours[card.answerZh] ?? null;
  }

  /** Turn on word recognition. Transcription runs on the server (mandarin-api),
   *  so there is nothing to download — enabling just needs the server configured. */
  async enableWordCheck() {
    if (!transcriptionAvailable()) {
      this.whisperState = 'error';
      this.whisperDetail = 'Word check needs the practice server, which isn’t available right now. Tone feedback still works.';
      return;
    }
    this.whisperState = 'ready';
    this.wordCheckEnabled = true;
    this.whisperProgress = 100;
    this.whisperDetail = 'Word check on — speak and it reads back what you said.';
  }

  disableWordCheck() {
    this.wordCheckEnabled = false;
    this.whisperState = 'off';
    this.whisperDetail = '';
  }

  #stopRecorder() {
    if (this.#recorder && this.#recorder.state !== 'inactive') {
      try {
        this.#recorder.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  async #runWordCheck(cardId: string) {
    const chunks = this.#recordedChunks;
    this.#recorder = null;
    this.#recordedChunks = [];
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: chunks[0].type || 'audio/webm' });
    if (!blob.size) return;

    this.whisperState = 'transcribing';
    this.whisperDetail = 'Reading back what you said…';
    try {
      const transcript = await transcribeClip(blob);
      const card = this.#getCard();
      // Transcription is slow; a card change invalidates this result.
      if (!card || card.id !== cardId) {
        this.whisperState = 'ready';
        this.whisperDetail = '';
        return;
      }
      this.recognitionResult = this.#spokenResult(card, transcript, 1);
      this.whisperState = 'ready';
      this.whisperDetail = '';
    } catch {
      this.whisperState = 'error';
      this.whisperDetail = 'Could not transcribe that take — the tone feedback above still holds.';
    }
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
    this.nativeMatch = null;
    this.nativeSyllables = [];
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
      this.recognitionResult = this.#spokenResult(liveCard, transcript, confidence);
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
        this.recognitionResult = this.#spokenResult(liveCard, '', 0);
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
    // Whisper word check (opt-in) replaces the flaky Web Speech path when on.
    if (!this.wordCheckEnabled) this.#startTextRecognition();

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

      // Capture the raw waveform for Whisper when word check is on.
      if (this.wordCheckEnabled && this.whisperState === 'ready' && typeof MediaRecorder !== 'undefined') {
        try {
          this.#recordedChunks = [];
          const recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (event) => {
            if (event.data.size) this.#recordedChunks.push(event.data);
          };
          recorder.onstop = () => void this.#runWordCheck(card.id);
          this.#recorder = recorder;
          recorder.start();
        } catch {
          // MediaRecorder unsupported here: tone feedback still runs.
          this.#recorder = null;
        }
      }

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

    // Flush the recorder before killing the stream. On a real attempt its
    // onstop transcribes; on an abort (Reveal) we detach and discard.
    if (this.#recorder && this.#recorder.state !== 'inactive') {
      if (!analyze) this.#recorder.onstop = null;
      this.#stopRecorder();
      if (!analyze) {
        this.#recorder = null;
        this.#recordedChunks = [];
      }
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
      const windowed = assessmentWindow(frames);
      this.toneAssessment = assessToneContours(card.pinyin, windowed);
      // Score the take against the native reference clip's pitch contour when we
      // have one — the honest, browser-independent signal that works without any
      // speech-recognition API.
      const reference = this.#referenceContour(card);
      if (reference) {
        const userContour = contourFromFrames(windowed);
        this.nativeMatch = compareContours(userContour, reference);
        this.nativeSyllables = compareBySyllable(userContour, reference, expectedToneSyllables(card.pinyin).length);
      } else {
        this.nativeMatch = null;
        this.nativeSyllables = [];
      }
    } else if (wasActive) {
      // Aborted mid-capture (e.g. Reveal): the interim assessment was computed
      // on partial audio and must not linger as if it were a finished verdict.
      this.toneAssessment = null;
      this.nativeMatch = null;
      this.nativeSyllables = [];
    }
  }
}
