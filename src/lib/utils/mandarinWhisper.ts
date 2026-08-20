// In-browser Mandarin word recognition via Whisper (transformers.js). Opt-in and
// lazy: the model (~tens of MB) and the transformers runtime are dynamically
// imported and downloaded only when the learner turns on word check, then cached
// by the browser. Audio never leaves the device — free and private, and it works
// in every browser (unlike the Web Speech API). See VISION.md "Pronunciation".
//
// Whisper sometimes emits traditional characters; we normalize to simplified
// (opencc-js) so the transcript can be compared to the app's simplified answers.

// Whisper for Mandarin, running fully on-device. Getting a working session in
// onnxruntime-web's WASM backend is fiddly:
//   - every *quantized* decoder these models ship (q4/q8/int8) block-quantizes
//     the token embedding into MatMulNBits, which WASM can't create a session
//     for ("Missing required scale … DequantizeLinear");
//   - the fp16 decoder loads but its WASM session hangs (poor WASM fp16 support).
// The reliable combination is a quantized encoder (small, WASM-safe) + the
// unquantized fp32 decoder: q8 encoder (~23 MB) + fp32 merged decoder (~208 MB)
// ≈ 230 MB, downloaded once and cached. Verified end-to-end in the browser
// (reaches ready, transcribes correctly). A WebGPU path could use the small q4
// decoder and shrink this a lot on capable browsers — noted for later.
const MODEL_ID = 'onnx-community/whisper-base';
const DTYPE = { encoder_model: 'q8', decoder_model_merged: 'fp32' } as const;

export type WhisperProgress = {
  status: string;
  file?: string;
  /** 0..100 while a model file downloads. */
  progress?: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsrPipeline = (audio: Float32Array, opts: Record<string, unknown>) => Promise<{ text?: string }>;

let pipelinePromise: Promise<AsrPipeline> | null = null;
let convert: ((text: string) => string) | null = null;

async function ensureConverter(): Promise<(text: string) => string> {
  if (convert) return convert;
  const OpenCC = await import('opencc-js');
  convert = OpenCC.Converter({ from: 't', to: 'cn' });
  return convert;
}

/** Kick off (or await) the one-time model load. Reports download progress. */
export async function loadWhisper(onProgress?: (p: WhisperProgress) => void): Promise<void> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      const asr = (await pipeline('automatic-speech-recognition', MODEL_ID, {
        dtype: DTYPE,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        progress_callback: (p: any) => onProgress?.({ status: p.status, file: p.file, progress: p.progress }),
      })) as unknown as AsrPipeline;
      return asr;
    })();
  }
  await pipelinePromise;
  await ensureConverter();
}

export function whisperRequested(): boolean {
  return pipelinePromise !== null;
}

function resampleTo16k(input: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate === 16000) return input;
  const ratio = 16000 / sampleRate;
  const outLength = Math.max(1, Math.round(input.length * ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const pos = i / ratio;
    const lo = Math.floor(pos);
    const hi = Math.min(lo + 1, input.length - 1);
    out[i] = input[lo] + (input[hi] - input[lo]) * (pos - lo);
  }
  return out;
}

/**
 * Transcribe Mandarin speech to simplified hanzi. `audio` is mono PCM at
 * `sampleRate`; it is resampled to the 16 kHz Whisper expects. Throws if the
 * model has not been loaded yet.
 */
export async function recognizeMandarin(audio: Float32Array, sampleRate: number): Promise<string> {
  if (!pipelinePromise) throw new Error('Whisper is not loaded');
  const asr = await pipelinePromise;
  const audio16 = resampleTo16k(audio, sampleRate);
  const output = await asr(audio16, { language: 'chinese', task: 'transcribe', chunk_length_s: 30 });
  const text = (output?.text ?? '').trim();
  const toSimplified = await ensureConverter();
  return toSimplified(text);
}
