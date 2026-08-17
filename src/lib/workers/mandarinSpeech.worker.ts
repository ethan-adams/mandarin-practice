import * as ort from 'onnxruntime-web/webgpu';
import { MANDARIN_MODEL, type MandarinSpeechBackend, type MandarinVoice } from '../utils/mandarinSpeech';

type SynthesizeRequest = { type: 'synthesize'; id: number; phonemes: string; voice: MandarinVoice };
type CancelRequest = { type: 'cancel'; id: number };
type TokenizerFile = { model: { vocab: Record<string, number> } };

const modelBase = `https://huggingface.co/${MANDARIN_MODEL.id}/resolve/${MANDARIN_MODEL.revision}`;
// Both backends synthesize with the fp16 model. The int8 `model_quantized.onnx`
// was the historical WASM default but is numerically broken on onnxruntime-web's
// WASM kernels for this model — it emits an all-NaN waveform on the large
// majority of inferences (measured ~0-10% finite in-browser, ~0% on several
// inputs), which no session option, thread count, or retry budget could salvage.
// fp16 is stable (every corpus fixture synthesizes finite audio) and only ~37 MB
// larger, so it replaces int8 on the portable WASM fallback. A single retry stays
// as a cheap guard against a rare transient failure; fp16 does not need more.
const MAX_WASM_ATTEMPTS = 2;
const canceled = new Set<number>();
const voices = new Map<MandarinVoice, Float32Array>();
type Runtime = { session: ort.InferenceSession; tokenizer: TokenizerFile; backend: MandarinSpeechBackend };
let runtime: Promise<Runtime> | null = null;
let webGpuDisabled = false;

function post(message: unknown, transfer: Transferable[] = []) {
  self.postMessage(message, { transfer });
}

async function fetchBytes(url: string, id: number, detail: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${detail} download failed (${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body || !total) return new Uint8Array(await response.arrayBuffer());

  const reader = response.body.getReader();
  const bytes = new Uint8Array(total);
  let received = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes.set(value, received);
    received += value.byteLength;
    post({ type: 'progress', id, progress: Math.min(99, Math.round((received / total) * 100)), detail });
  }
  return received === bytes.length ? bytes : bytes.slice(0, received);
}

async function createRuntime(id: number) {
  const tokenizerPromise = fetch(`${modelBase}/tokenizer.json`).then(async (response) => {
    if (!response.ok) throw new Error(`Tokenizer download failed (${response.status}).`);
    return (await response.json()) as TokenizerFile;
  });

  if (!webGpuDisabled && 'gpu' in navigator) {
    try {
      const model = await fetchBytes(`${modelBase}/onnx/model_fp16.onnx`, id, 'Loading neural voice model');
      const session = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
      return { session, tokenizer: await tokenizerPromise, backend: 'webgpu' as const };
    } catch {
      post({ type: 'progress', id, progress: 0, detail: 'WebGPU unavailable; loading compatible model' });
    }
  }

  const model = await fetchBytes(`${modelBase}/onnx/model_fp16.onnx`, id, 'Loading compatible neural voice model');
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  return { session, tokenizer: await tokenizerPromise, backend: 'wasm' as const };
}

async function getRuntime(id: number) {
  runtime ??= createRuntime(id);
  try {
    return await runtime;
  } catch (error) {
    runtime = null;
    throw error;
  }
}

async function getVoice(voice: MandarinVoice) {
  const cached = voices.get(voice);
  if (cached) return cached;
  const response = await fetch(`${modelBase}/voices/${voice}.bin`);
  if (!response.ok) throw new Error(`Voice ${voice} download failed (${response.status}).`);
  const value = new Float32Array(await response.arrayBuffer());
  voices.set(voice, value);
  return value;
}

function encodeWav(samples: Float32Array, sampleRate = 24_000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

async function runInference(active: Runtime, request: SynthesizeRequest) {
  const { id, phonemes, voice } = request;
  const ids = [0, ...[...phonemes].map((character) => active.tokenizer.model.vocab[character] ?? 0), 0];
  const voiceData = await getVoice(voice);
  const styleOffset = 256 * Math.min(Math.max(ids.length - 2, 0), 509);
  const output = await active.session.run({
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    style: new ort.Tensor('float32', voiceData.slice(styleOffset, styleOffset + 256), [1, 256]),
    speed: new ort.Tensor('float32', Float32Array.of(0.9), [1]),
  });
  if (canceled.delete(id)) return;
  const samples = output.waveform.data as Float32Array;
  if (!samples.length || samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error('The neural voice returned invalid audio. Browser speech remains available.');
  }
  const audio = encodeWav(samples);
  post({ type: 'result', id, audio, backend: active.backend, voice }, [audio]);
}

async function runWithRetries(active: Runtime, request: SynthesizeRequest) {
  const attempts = active.backend === 'wasm' ? MAX_WASM_ATTEMPTS : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await runInference(active, request);
    } catch (error) {
      lastError = error;
      if (canceled.delete(request.id)) return;
    }
  }
  throw lastError;
}

async function synthesize(request: SynthesizeRequest) {
  const { id } = request;
  let active = await getRuntime(id);
  if (canceled.delete(id)) return;
  post({ type: 'ready', id, backend: active.backend });

  try {
    await runWithRetries(active, request);
  } catch (error) {
    // A WebGPU session can initialize yet still compute invalid audio on some
    // GPU/driver stacks; rebuild on the portable WASM path before giving up.
    if (active.backend !== 'webgpu') throw error;
    webGpuDisabled = true;
    runtime = null;
    post({ type: 'progress', id, progress: 0, detail: 'Neural output was invalid; retrying with the compatible model' });
    active = await getRuntime(id);
    if (canceled.delete(id)) return;
    post({ type: 'ready', id, backend: active.backend });
    await runWithRetries(active, request);
  }
}

export function onWorkerMessage(event: MessageEvent<SynthesizeRequest | CancelRequest>) {
  if (event.data.type === 'cancel') {
    canceled.add(event.data.id);
    return;
  }
  void synthesize(event.data).catch((error) => {
    const message = error instanceof Error ? error.message : 'Mandarin neural speech failed.';
    post({ type: 'error', id: event.data.id, message });
  });
}

// Only register when actually running as a worker (unit tests import this module).
if (typeof window === 'undefined' && typeof self !== 'undefined') {
  self.onmessage = onWorkerMessage;
}
