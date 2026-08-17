import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createSession = vi.fn();

vi.mock('onnxruntime-web/webgpu', () => ({
  InferenceSession: { create: (...args: unknown[]) => createSession(...args) },
  Tensor: class MockTensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
  },
}));

type PostedMessage = { type: string; id: number; backend?: string; message?: string; detail?: string };

const VALID = Float32Array.from({ length: 1200 }, (_, index) => Math.sin(index / 20) * 0.3);
const ALL_NAN = Float32Array.from({ length: 1200 }, () => Number.NaN);

function stubEnvironment({ gpu }: { gpu: boolean }) {
  const posted: PostedMessage[] = [];
  vi.stubGlobal('self', { postMessage: (message: PostedMessage) => posted.push(message) });
  vi.stubGlobal('navigator', gpu ? { gpu: {} } : {});
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('tokenizer.json')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ model: { vocab: { a: 5 } } }) });
    }
    return Promise.resolve({
      ok: true,
      headers: { get: () => '0' },
      body: null,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(510 * 256 * 4)),
    });
  });
  return posted;
}

function sessionReturning(outputs: Float32Array[]) {
  let call = 0;
  return {
    run: vi.fn(() => {
      const samples = outputs[Math.min(call, outputs.length - 1)];
      call += 1;
      return Promise.resolve({ waveform: { data: samples } });
    }),
  };
}

async function requestSynthesis(posted: PostedMessage[]) {
  const worker = await import('./mandarinSpeech.worker');
  worker.onWorkerMessage({ data: { type: 'synthesize', id: 1, phonemes: 'a', voice: 'zf_001' } } as MessageEvent);
  await vi.waitFor(() => expect(posted.some((message) => message.type === 'result' || message.type === 'error')).toBe(true));
  return posted.find((message) => message.type === 'result' || message.type === 'error')!;
}

describe('mandarinSpeech worker resilience', () => {
  beforeEach(() => {
    vi.resetModules();
    createSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rebuilds on WASM and retries when a live WebGPU session computes invalid audio', async () => {
    const posted = stubEnvironment({ gpu: true });
    const webgpuSession = sessionReturning([ALL_NAN]);
    const wasmSession = sessionReturning([VALID]);
    createSession.mockResolvedValueOnce(webgpuSession).mockResolvedValueOnce(wasmSession);

    const outcome = await requestSynthesis(posted);
    expect(outcome).toMatchObject({ type: 'result', backend: 'wasm' });
    expect(createSession).toHaveBeenCalledTimes(2);
    expect(createSession.mock.calls[0][1]).toEqual({ executionProviders: ['webgpu'] });
    expect(createSession.mock.calls[1][1]).toEqual({ executionProviders: ['wasm'] });
    expect(webgpuSession.run).toHaveBeenCalledTimes(1);
    expect(wasmSession.run).toHaveBeenCalledTimes(1);
  });

  it('retries transient all-NaN WASM output within the same session', async () => {
    const posted = stubEnvironment({ gpu: false });
    const wasmSession = sessionReturning([ALL_NAN, VALID]);
    createSession.mockResolvedValue(wasmSession);

    const outcome = await requestSynthesis(posted);
    expect(outcome).toMatchObject({ type: 'result', backend: 'wasm' });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(wasmSession.run).toHaveBeenCalledTimes(2);
  });

  it('reports an honest error when WASM output stays invalid after every retry', async () => {
    const posted = stubEnvironment({ gpu: false });
    const wasmSession = sessionReturning([ALL_NAN]);
    createSession.mockResolvedValue(wasmSession);

    const outcome = await requestSynthesis(posted);
    expect(outcome.type).toBe('error');
    expect(outcome.message).toContain('invalid audio');
    // fp16 is stable, so the WASM budget is one attempt plus a single cheap retry.
    expect(wasmSession.run).toHaveBeenCalledTimes(2);
  });
});
