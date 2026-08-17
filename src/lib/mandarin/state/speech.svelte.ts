// Audio playback for the learning core: prebuilt/neural speech engine
// lifecycle, per-card voice selection, and the verified browser-voice
// fallback. Browser speech only counts as available once a Mandarin voice is
// verified — speaking zh text without one is a silent no-op on most
// Windows/Linux browsers, and silence must never be reported as success.

import { findMandarinVoice } from '../../utils/mandarinBrowserVoice';
import {
  MandarinSpeechEngine,
  StaleMandarinSpeechRequestError,
  selectMandarinVoice,
  type MandarinPlaybackBackend,
  type MandarinSpeechResult,
  type MandarinVoice,
} from '../../utils/mandarinSpeech';
import type { ContrastCue } from '../../utils/mandarinContrastPractice';
import type { Card } from '../logic/deck';
import type { PracticeSettings } from './settings.svelte';

export type SpeechStatus = 'idle' | 'loading' | 'ready' | 'synthesizing' | 'error' | 'fallback';

export class SpeechController {
  status = $state<SpeechStatus>('idle');
  progress = $state(0);
  detail = $state('Prebuilt audio plays instantly; the neural model covers anything else.');
  backend = $state<MandarinPlaybackBackend | null>(null);
  lastAudioVoice = $state('');

  #previousVoice: MandarinVoice | undefined = undefined;
  #lastSpokenCardId = '';
  #engine: MandarinSpeechEngine | null = null;
  #currentAudio: HTMLAudioElement | null = null;
  #currentAudioUrl = '';

  readonly #settings: PracticeSettings;
  readonly #getCurrentCard: () => Card | null;

  constructor(settings: PracticeSettings, getCurrentCard: () => Card | null) {
    this.#settings = settings;
    this.#getCurrentCard = getCurrentCard;
  }

  #ensureEngine() {
    this.#engine ??= new MandarinSpeechEngine((event) => {
      if (event.type === 'loading') {
        this.status = 'loading';
        this.progress = event.progress;
        this.detail = event.detail;
      } else if (event.type === 'ready') {
        this.status = 'ready';
        this.backend = event.backend;
        this.detail = event.backend === 'prebuilt' ? 'Prebuilt audio ready.' : `${event.backend.toUpperCase()} neural speech ready.`;
      } else if (event.type === 'synthesizing') {
        this.status = 'synthesizing';
        this.detail = `Generating ${event.voice} on this device…`;
      } else {
        this.status = 'error';
        this.detail = event.message;
      }
    });
    return this.#engine;
  }

  #releaseAudioUrl() {
    if (this.#currentAudioUrl) URL.revokeObjectURL(this.#currentAudioUrl);
    this.#currentAudioUrl = '';
  }

  #describePlayback(result: MandarinSpeechResult, kind: 'answer' | 'contrast') {
    if (result.backend === 'prebuilt') return `Played prebuilt ${kind === 'contrast' ? 'contrast ' : ''}audio — no download needed.`;
    return `${result.cached ? 'Replayed cached' : 'Generated'} ${result.backend.toUpperCase()} ${kind === 'contrast' ? 'contrast ' : ''}audio.`;
  }

  async #speakWithBrowserVoice(text: string, detail: string, stillWanted: () => boolean = () => true): Promise<boolean> {
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const voice = synth ? await findMandarinVoice(synth) : null;
    if (!stillWanted()) return true;
    if (!synth || !voice) {
      this.status = 'error';
      this.detail = 'No Chinese voice is available in this browser, so audio is muted. Practice and manual ratings still work.';
      return false;
    }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang || 'zh-CN';
    utterance.rate = 0.82;
    utterance.pitch = 1;
    utterance.onerror = (event) => {
      if (event.error === 'interrupted' || event.error === 'canceled') return;
      this.status = 'error';
      this.detail = 'The browser voice failed to play. Retry neural speech when ready.';
    };
    this.lastAudioVoice = `browser · ${voice.name}`;
    this.status = 'fallback';
    this.detail = `Using the browser voice (${voice.name})${detail}. Retry neural speech when ready.`;
    synth.speak(utterance);
    return true;
  }

  async speakAnswer() {
    const card = this.#getCurrentCard();
    if (!card) return;
    this.#currentAudio?.pause();
    this.#releaseAudioUrl();
    const voice =
      this.#lastSpokenCardId === card.id && this.#previousVoice
        ? this.#previousVoice
        : selectMandarinVoice(card.id, this.#settings.voiceMode, this.#settings.singleVoice, this.#previousVoice);
    this.lastAudioVoice = voice;

    try {
      const result = await this.#ensureEngine().synthesize(card.id, card.speechPhonemes, voice);
      if (this.#getCurrentCard()?.id !== card.id) return;
      this.#previousVoice = result.voice;
      this.#lastSpokenCardId = card.id;
      this.backend = result.backend;
      this.status = 'ready';
      this.progress = 100;
      this.detail = this.#describePlayback(result, 'answer');
      this.#currentAudioUrl = URL.createObjectURL(new Blob([result.audio], { type: result.mime }));
      this.#currentAudio = new Audio(this.#currentAudioUrl);
      await this.#currentAudio.play();
    } catch (error) {
      if (error instanceof StaleMandarinSpeechRequestError) return;
      this.detail = error instanceof Error ? error.message : 'Neural speech failed.';
      await this.speakAnswerFallback(card);
    }
  }

  async speakAnswerFallback(card = this.#getCurrentCard()) {
    if (!card) return;
    await this.#speakWithBrowserVoice(card.answerZh, '', () => this.#getCurrentCard()?.id === card.id);
  }

  async playContrastCue(cue: ContrastCue, options: { onAudioUnavailable?: () => void } = {}) {
    this.#currentAudio?.pause();
    this.#releaseAudioUrl();
    const voice = selectMandarinVoice(`contrast:${cue.id}`, this.#settings.voiceMode, this.#settings.singleVoice);
    this.lastAudioVoice = voice;

    try {
      const result = await this.#ensureEngine().synthesize(`contrast:${cue.id}`, cue.speechPhonemes, voice);
      this.backend = result.backend;
      this.status = 'ready';
      this.progress = 100;
      this.detail = this.#describePlayback(result, 'contrast');
      this.#currentAudioUrl = URL.createObjectURL(new Blob([result.audio], { type: result.mime }));
      this.#currentAudio = new Audio(this.#currentAudioUrl);
      await this.#currentAudio.play();
      return true;
    } catch (error) {
      if (error instanceof StaleMandarinSpeechRequestError) return false;
      this.detail = error instanceof Error ? error.message : 'Neural contrast speech failed.';
      if (await this.#speakWithBrowserVoice(cue.han, ' for this contrast')) return true;
      this.detail = 'No Chinese browser voice is available, so contrast audio is muted. You can reveal the answer or continue card practice.';
      options.onAudioUnavailable?.();
      return false;
    }
  }

  retryNeuralSpeech() {
    this.#engine?.dispose();
    this.#engine = null;
    this.status = 'idle';
    this.progress = 0;
    void this.speakAnswer();
  }

  clearCache() {
    this.#engine?.clearCache();
    this.detail = 'Generated answer cache cleared.';
  }

  dispose() {
    this.#currentAudio?.pause();
    this.#releaseAudioUrl();
    this.#engine?.dispose();
  }
}
