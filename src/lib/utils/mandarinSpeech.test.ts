import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MANDARIN_MODEL,
  MANDARIN_PREBUILT_MANIFEST_URL,
  MANDARIN_VOICES,
  MandarinSpeechEngine,
  StaleMandarinSpeechRequestError,
  mandarinSpeechCacheKey,
  selectMandarinVoice,
  type MandarinVoice,
  type SpeechWorkerLike,
} from './mandarinSpeech';

class FakeWorker implements SpeechWorkerLike {
  onmessage: SpeechWorkerLike['onmessage'] = null;
  onerror: SpeechWorkerLike['onerror'] = null;
  messages: unknown[] = [];
  terminated = false;

  postMessage(message: unknown) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(data: unknown) {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('Mandarin voice selection', () => {
  it('is stable and model-versioned', () => {
    const first = selectMandarinVoice('card-42', 'variety');
    expect(selectMandarinVoice('card-42', 'variety')).toBe(first);
    expect(MANDARIN_MODEL.version).toContain('kokoro-1.1-zh');
  });

  it('avoids an immediate repeat while keeping a curated pool', () => {
    const selected = selectMandarinVoice('card-42', 'variety');
    expect(MANDARIN_VOICES.length).toBeGreaterThanOrEqual(8);
    expect(selectMandarinVoice('card-42', 'variety', MANDARIN_VOICES[0], selected)).not.toBe(selected);
  });

  it('honors single-voice mode', () => {
    expect(selectMandarinVoice('anything', 'single', 'zm_010')).toBe('zm_010');
  });
});

describe('MandarinSpeechEngine', () => {
  it('handles worker progress, results, and replay cache hits', async () => {
    const worker = new FakeWorker();
    const events: unknown[] = [];
    const engine = new MandarinSpeechEngine((event) => events.push(event), () => worker, 8, null);
    const first = engine.synthesize('card-1', 'ㄋㄧ3ㄏㄠ3.', 'zf_001');
    await vi.waitFor(() =>
      expect(worker.messages).toEqual([{ type: 'synthesize', id: 1, phonemes: 'ㄋㄧ3ㄏㄠ3.', voice: 'zf_001' }]),
    );
    worker.respond({ type: 'progress', id: 1, progress: 25, detail: 'Loading model' });
    worker.respond({ type: 'ready', id: 1, backend: 'wasm' });
    worker.respond({ type: 'result', id: 1, audio: new ArrayBuffer(8), backend: 'wasm', voice: 'zf_001' });
    await expect(first).resolves.toMatchObject({ backend: 'wasm', voice: 'zf_001', cached: false });

    await expect(engine.synthesize('card-1', 'ㄋㄧ3ㄏㄠ3.', 'zf_001')).resolves.toMatchObject({ cached: true });
    expect(worker.messages).toHaveLength(1);
    expect(events).toContainEqual({ type: 'loading', progress: 25, detail: 'Loading model' });
  });

  it('rejects stale requests and ignores their late worker result', async () => {
    const worker = new FakeWorker();
    const engine = new MandarinSpeechEngine(() => {}, () => worker, 8, null);
    const stale = engine.synthesize('card-1', 'first', 'zf_001');
    await vi.waitFor(() => expect(worker.messages).toHaveLength(1));
    const current = engine.synthesize('card-2', 'second', 'zf_003');
    await expect(stale).rejects.toBeInstanceOf(StaleMandarinSpeechRequestError);
    await vi.waitFor(() => expect(worker.messages).toContainEqual({ type: 'synthesize', id: 2, phonemes: 'second', voice: 'zf_003' }));
    worker.respond({ type: 'result', id: 1, audio: new ArrayBuffer(2), backend: 'wasm', voice: 'zf_001' });
    worker.respond({ type: 'result', id: 2, audio: new ArrayBuffer(4), backend: 'webgpu', voice: 'zf_003' });
    await expect(current).resolves.toMatchObject({ backend: 'webgpu', voice: 'zf_003' });
    expect(worker.messages).toContainEqual({ type: 'cancel', id: 1 });
  });

  it('propagates worker failures and can clear its bounded cache', async () => {
    const worker = new FakeWorker();
    const engine = new MandarinSpeechEngine(() => {}, () => worker, 1, null);
    const result = engine.synthesize('card-1', 'first', 'zf_001');
    await vi.waitFor(() => expect(worker.messages).toHaveLength(1));
    worker.respond({ type: 'error', id: 1, message: 'model unavailable' });
    await expect(result).rejects.toThrow('model unavailable');
    engine.clearCache();
    engine.dispose();
    expect(worker.terminated).toBe(true);
  });
});

describe('MandarinSpeechEngine prebuilt audio', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const cacheKey = (cardId: string, voice: MandarinVoice, phonemes: string) =>
    mandarinSpeechCacheKey(cardId, voice, phonemes);

  function stubPrebuiltFetch(manifest: unknown, files: Record<string, ArrayBuffer> = {}) {
    const requests: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = String(input);
      requests.push(url);
      if (url === MANDARIN_PREBUILT_MANIFEST_URL) {
        if (manifest === null) return Promise.reject(new TypeError('network down'));
        return Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) } as Response);
      }
      const file = files[url.split('/').pop() ?? ''];
      if (!file) return Promise.resolve({ ok: false, status: 404 } as Response);
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(file.slice(0)) } as Response);
    });
    return requests;
  }

  it('serves manifest hits without ever spawning the neural worker', async () => {
    const key = cacheKey('card-1', 'zf_001', 'ㄋㄧ3ㄏㄠ3.');
    stubPrebuiltFetch({ version: MANDARIN_MODEL.version, entries: { [key]: 'abc.mp3' } }, { 'abc.mp3': new ArrayBuffer(16) });
    const events: unknown[] = [];
    let workerSpawned = false;
    const engine = new MandarinSpeechEngine(
      (event) => events.push(event),
      () => {
        workerSpawned = true;
        return new FakeWorker();
      },
    );
    const result = await engine.synthesize('card-1', 'ㄋㄧ3ㄏㄠ3.', 'zf_001');
    expect(result).toMatchObject({ backend: 'prebuilt', voice: 'zf_001', cached: false, mime: 'audio/mpeg' });
    expect(result.audio.byteLength).toBe(16);
    expect(workerSpawned).toBe(false);
    expect(events).toContainEqual({ type: 'ready', backend: 'prebuilt' });
  });

  it('falls through to the worker on manifest misses, version drift, and clip fetch failures', async () => {
    const staleKey = cacheKey('card-2', 'zf_001', 'x');
    for (const manifest of [
      null,
      { version: 'other-model@0', entries: { [staleKey]: 'abc.mp3' } },
      { version: MANDARIN_MODEL.version, entries: { [staleKey]: 'missing.mp3' } },
    ]) {
      stubPrebuiltFetch(manifest);
      const worker = new FakeWorker();
      const engine = new MandarinSpeechEngine(() => {}, () => worker);
      const result = engine.synthesize('card-2', 'x', 'zf_001');
      await vi.waitFor(() => expect(worker.messages).toHaveLength(1));
      worker.respond({ type: 'result', id: 1, audio: new ArrayBuffer(4), backend: 'wasm', voice: 'zf_001' });
      await expect(result).resolves.toMatchObject({ backend: 'wasm', mime: 'audio/wav' });
      vi.unstubAllGlobals();
    }
  });

  it('cancels a request that is still in the prebuilt lookup when a newer one arrives', async () => {
    const key = cacheKey('card-1', 'zf_001', 'first');
    stubPrebuiltFetch(
      { version: MANDARIN_MODEL.version, entries: { [key]: 'abc.mp3' } },
      { 'abc.mp3': new ArrayBuffer(8) },
    );
    const worker = new FakeWorker();
    const engine = new MandarinSpeechEngine(() => {}, () => worker);
    const stale = engine.synthesize('card-1', 'first', 'zf_001');
    const current = engine.synthesize('card-2', 'second', 'zf_003');
    await expect(stale).rejects.toBeInstanceOf(StaleMandarinSpeechRequestError);
    await vi.waitFor(() => expect(worker.messages).toContainEqual({ type: 'synthesize', id: 2, phonemes: 'second', voice: 'zf_003' }));
    worker.respond({ type: 'result', id: 2, audio: new ArrayBuffer(4), backend: 'wasm', voice: 'zf_003' });
    await expect(current).resolves.toMatchObject({ backend: 'wasm', voice: 'zf_003' });
  });
});
