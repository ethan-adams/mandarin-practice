// Audio playback for the learning core. Cards ship a prebuilt, stored clip
// (card.audioUrl) that plays instantly — no on-the-fly synthesis, no model
// download (see VISION.md "Prebuilt stored audio"). When a clip is missing or
// the network is down, playback degrades to the browser's own Chinese voice.
// Browser speech only counts as available once a Mandarin voice is verified —
// speaking zh text without one is a silent no-op on most Windows/Linux
// browsers, and silence must never be reported as success.

import { findMandarinVoice } from '../../utils/mandarinBrowserVoice';
import type { ContrastCue } from '../../utils/mandarinContrastPractice';
import type { Card } from '../logic/deck';
import type { PracticeSettings } from './settings.svelte';

export type SpeechStatus = 'idle' | 'playing' | 'ready' | 'error' | 'fallback' | 'muted';

export class SpeechController {
  status = $state<SpeechStatus>('idle');
  progress = $state(0);
  detail = $state('Prebuilt audio plays instantly.');
  backend = $state<string | null>(null);
  lastAudioVoice = $state('');

  #currentAudio: HTMLAudioElement | null = null;

  readonly #settings: PracticeSettings;
  readonly #getCurrentCard: () => Card | null;

  constructor(settings: PracticeSettings, getCurrentCard: () => Card | null) {
    this.#settings = settings;
    this.#getCurrentCard = getCurrentCard;
  }

  #stopCurrent() {
    if (this.#currentAudio) {
      this.#currentAudio.pause();
      this.#currentAudio = null;
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Play a stored clip. Resolves true on success, false so the caller can fall
   * back to the browser voice (missing clip, autoplay block, network error). */
  async #playUrl(url: string, stillWanted: () => boolean): Promise<boolean> {
    try {
      const audio = new Audio(url);
      this.#currentAudio = audio;
      this.status = 'playing';
      await audio.play();
      if (!stillWanted()) {
        audio.pause();
        return true;
      }
      this.status = 'ready';
      this.backend = 'prebuilt';
      this.lastAudioVoice = 'native (prebuilt)';
      this.detail = 'Played prebuilt audio — no download needed.';
      return true;
    } catch {
      return false;
    }
  }

  async #speakWithBrowserVoice(text: string, detail: string, stillWanted: () => boolean = () => true): Promise<boolean> {
    const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
    const voice = synth ? await findMandarinVoice(synth) : null;
    if (!stillWanted()) return true;
    if (!synth || !voice) {
      this.status = 'muted';
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
      this.detail = 'The browser voice failed to play.';
    };
    this.lastAudioVoice = `browser · ${voice.name}`;
    this.backend = 'browser';
    this.status = 'fallback';
    this.detail = `Using the browser voice (${voice.name})${detail}.`;
    synth.speak(utterance);
    return true;
  }

  async speakAnswer() {
    const card = this.#getCurrentCard();
    if (!card) return;
    this.#stopCurrent();
    const stillWanted = () => this.#getCurrentCard()?.id === card.id;

    if (card.audioUrl && (await this.#playUrl(card.audioUrl, stillWanted))) return;
    // No stored clip, or it failed to play: speak the hanzi with the browser voice.
    await this.speakAnswerFallback(card);
  }

  async speakAnswerFallback(card = this.#getCurrentCard()) {
    if (!card) return;
    await this.#speakWithBrowserVoice(card.answerZh, '', () => this.#getCurrentCard()?.id === card.id);
  }

  async playContrastCue(cue: ContrastCue, options: { onAudioUnavailable?: () => void } = {}) {
    this.#stopCurrent();
    if (cue.audioUrl && (await this.#playUrl(cue.audioUrl, () => true))) return true;
    if (await this.#speakWithBrowserVoice(cue.han, ' for this contrast')) return true;
    this.detail = 'No Chinese browser voice is available, so contrast audio is muted. You can reveal the answer or continue card practice.';
    options.onAudioUnavailable?.();
    return false;
  }

  /** Play a specific card's audio, independent of the current practice card
   *  (used by listening practice). Prefers the prebuilt native clip, falls back
   *  to the browser voice, then reports unavailable so the caller degrades
   *  honestly instead of silently doing nothing. */
  async playClip(card: Card, options: { onAudioUnavailable?: () => void } = {}): Promise<boolean> {
    this.#stopCurrent();
    if (card.audioUrl && (await this.#playUrl(card.audioUrl, () => true))) return true;
    if (await this.#speakWithBrowserVoice(card.answerZh, '')) return true;
    this.detail = 'No Chinese browser voice is available, so listening audio is muted. Reveal the answer or continue card practice.';
    options.onAudioUnavailable?.();
    return false;
  }

  /** Retry playing the current answer (kept for the sidebar control). */
  retryNeuralSpeech() {
    this.status = 'idle';
    this.progress = 0;
    void this.speakAnswer();
  }

  /** No persistent cache to clear now that audio is served as stored URLs. */
  clearCache() {
    this.detail = 'Audio is served from stored clips; nothing to clear.';
  }

  dispose() {
    this.#stopCurrent();
  }
}
