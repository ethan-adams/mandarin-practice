export const MANDARIN_MODEL = {
  id: 'onnx-community/Kokoro-82M-v1.1-zh-ONNX',
  revision: '6cc0f0d2ebe369a68b0df87c2b65c1af8c0ac3e3',
  version: 'kokoro-1.1-zh@6cc0f0d2',
} as const;

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
export type MandarinSpeechBackend = 'webgpu' | 'wasm';
export type MandarinPlaybackBackend = MandarinSpeechBackend | 'prebuilt';
export type MandarinSpeechEvent =
  | { type: 'loading'; progress: number; detail: string }
  | { type: 'ready'; backend: MandarinPlaybackBackend }
  | { type: 'synthesizing'; voice: MandarinVoice }
  | { type: 'error'; message: string };

export type MandarinSpeechResult = {
  audio: ArrayBuffer;
  backend: MandarinPlaybackBackend;
  voice: MandarinVoice;
  cached: boolean;
  mime: string;
};

type PrebuiltManifest = { version: string; entries: Record<string, string> };

export const MANDARIN_PREBUILT_MANIFEST_URL = '/mandarin-audio/manifest.json';

// Single source of truth for the clip identity used by the in-memory cache and
// any prebuilt-audio manifest that ships alongside a deck.
export function mandarinSpeechCacheKey(cardId: string, voice: MandarinVoice, phonemes: string) {
  return `${MANDARIN_MODEL.version}:${cardId}:${voice}:${phonemes}`;
}

type WorkerRequest =
  | { type: 'synthesize'; id: number; phonemes: string; voice: MandarinVoice }
  | { type: 'cancel'; id: number };

type WorkerResponse =
  | { type: 'progress'; id: number; progress: number; detail: string }
  | { type: 'ready'; id: number; backend: MandarinSpeechBackend }
  | { type: 'result'; id: number; audio: ArrayBuffer; backend: MandarinSpeechBackend; voice: MandarinVoice }
  | { type: 'error'; id: number; message: string };

export type SpeechWorkerLike = {
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage: (message: WorkerRequest) => void;
  terminate: () => void;
};

type PendingRequest = {
  cacheKey: string;
  voice: MandarinVoice;
  resolve: (result: MandarinSpeechResult) => void;
  reject: (error: Error) => void;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectMandarinVoice(
  cardId: string,
  mode: MandarinVoiceMode,
  singleVoice: MandarinVoice = MANDARIN_VOICES[0],
  previousVoice?: MandarinVoice,
): MandarinVoice {
  if (mode === 'single') return singleVoice;
  let index = stableHash(`${cardId}:${MANDARIN_MODEL.version}`) % MANDARIN_VOICES.length;
  if (MANDARIN_VOICES[index] === previousVoice) index = (index + 1) % MANDARIN_VOICES.length;
  return MANDARIN_VOICES[index];
}

export class StaleMandarinSpeechRequestError extends Error {
  constructor() {
    super('A newer Mandarin speech request replaced this one.');
    this.name = 'StaleMandarinSpeechRequestError';
  }
}

export class MandarinSpeechEngine {
  private worker: SpeechWorkerLike | null = null;
  private requestId = 0;
  private pending = new Map<number, PendingRequest>();
  private cache = new Map<string, Omit<MandarinSpeechResult, 'cached'>>();
  private manifest: Promise<PrebuiltManifest['entries'] | null> | null = null;

  constructor(
    private readonly onEvent: (event: MandarinSpeechEvent) => void = () => {},
    private readonly workerFactory: () => SpeechWorkerLike = () =>
      new Worker(new URL('../workers/mandarinSpeech.worker.ts', import.meta.url), { type: 'module' }),
    private readonly maximumCacheEntries = 8,
    private readonly prebuiltManifestUrl: string | null = MANDARIN_PREBUILT_MANIFEST_URL,
  ) {}

  async synthesize(cardId: string, phonemes: string, voice: MandarinVoice): Promise<MandarinSpeechResult> {
    const cacheKey = mandarinSpeechCacheKey(cardId, voice, phonemes);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return { ...cached, audio: cached.audio.slice(0), cached: true };
    }

    for (const [id, request] of this.pending) {
      this.worker?.postMessage({ type: 'cancel', id });
      request.reject(new StaleMandarinSpeechRequestError());
      this.pending.delete(id);
    }

    // Register before any awaiting so a newer request can still cancel this one
    // while the prebuilt lookup is in flight.
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { cacheKey, voice, resolve, reject });
      void this.dispatch(id, cacheKey, phonemes, voice);
    });
  }

  private async dispatch(id: number, cacheKey: string, phonemes: string, voice: MandarinVoice) {
    const prebuilt = await this.fetchPrebuilt(cacheKey, voice);
    const request = this.pending.get(id);
    if (!request) return;
    if (prebuilt) {
      this.pending.delete(id);
      this.onEvent({ type: 'ready', backend: 'prebuilt' });
      request.resolve(prebuilt);
      return;
    }
    this.onEvent({ type: 'synthesizing', voice });
    this.ensureWorker().postMessage({ type: 'synthesize', id, phonemes, voice });
  }

  clearCache() {
    this.cache.clear();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    for (const request of this.pending.values()) request.reject(new StaleMandarinSpeechRequestError());
    this.pending.clear();
    this.clearCache();
  }

  // Prebuilt, content-addressed clips are the first playback tier: no model
  // download, no on-device inference, and they work on any modern browser. Any
  // failure falls through to neural synthesis.
  private async fetchPrebuilt(cacheKey: string, voice: MandarinVoice): Promise<MandarinSpeechResult | null> {
    const manifestUrl = this.prebuiltManifestUrl;
    if (!manifestUrl) return null;
    this.manifest ??= (async () => {
      try {
        const response = await fetch(manifestUrl);
        if (!response.ok) return null;
        const payload = (await response.json()) as PrebuiltManifest;
        return payload.version === MANDARIN_MODEL.version && payload.entries ? payload.entries : null;
      } catch {
        return null;
      }
    })();
    const file = (await this.manifest)?.[cacheKey];
    if (!file) return null;
    try {
      const response = await fetch(manifestUrl.replace(/[^/]*$/, file));
      if (!response.ok) return null;
      const audio = await response.arrayBuffer();
      if (!audio.byteLength) return null;
      return { audio, backend: 'prebuilt', voice, cached: false, mime: 'audio/mpeg' };
    } catch {
      return null;
    }
  }

  private ensureWorker() {
    if (this.worker) return this.worker;
    const worker = this.workerFactory();
    worker.onmessage = (event) => this.handleMessage(event.data);
    worker.onerror = (event) => {
      const message = event.message || 'Mandarin neural speech worker failed.';
      this.onEvent({ type: 'error', message });
      for (const request of this.pending.values()) request.reject(new Error(message));
      this.pending.clear();
    };
    this.worker = worker;
    return worker;
  }

  private handleMessage(message: WorkerResponse) {
    const request = this.pending.get(message.id);
    if (!request) return;
    if (message.type === 'progress') {
      this.onEvent({ type: 'loading', progress: message.progress, detail: message.detail });
      return;
    }
    if (message.type === 'ready') {
      this.onEvent({ type: 'ready', backend: message.backend });
      return;
    }
    if (message.type === 'error') {
      this.pending.delete(message.id);
      this.onEvent({ type: 'error', message: message.message });
      request.reject(new Error(message.message));
      return;
    }

    this.pending.delete(message.id);
    const stored = { audio: message.audio.slice(0), backend: message.backend, voice: request.voice, mime: 'audio/wav' };
    this.cache.set(request.cacheKey, stored);
    while (this.cache.size > this.maximumCacheEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
    request.resolve({ ...stored, audio: message.audio, cached: false });
  }
}
