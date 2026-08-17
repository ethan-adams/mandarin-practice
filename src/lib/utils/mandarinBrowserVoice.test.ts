import { describe, expect, it, vi } from 'vitest';
import { findMandarinVoice, pickMandarinVoice, type SpeechSynthesisVoiceLike } from './mandarinBrowserVoice';

const voice = (lang: string, name: string, isDefault = false): SpeechSynthesisVoiceLike => ({ lang, name, default: isDefault });

describe('pickMandarinVoice', () => {
  it('returns null when no Mandarin voice exists', () => {
    expect(pickMandarinVoice([])).toBeNull();
    expect(pickMandarinVoice([voice('en-US', 'Samantha', true), voice('de-DE', 'Anna')])).toBeNull();
    // "zh" must match as a language tag, not a substring.
    expect(pickMandarinVoice([voice('xzh-XX', 'Weird')])).toBeNull();
  });

  it('accepts zh and cmn language tags in any casing or separator', () => {
    expect(pickMandarinVoice([voice('zh-CN', 'Tingting')])?.name).toBe('Tingting');
    expect(pickMandarinVoice([voice('zh_TW', 'Meijia')])?.name).toBe('Meijia');
    expect(pickMandarinVoice([voice('cmn-Hans-CN', 'Android')])?.name).toBe('Android');
    expect(pickMandarinVoice([voice('zh', 'Bare')])?.name).toBe('Bare');
  });

  it('prefers mainland/simplified voices, then browser defaults', () => {
    const picked = pickMandarinVoice([voice('zh-TW', 'Meijia', true), voice('zh-CN', 'Tingting')]);
    expect(picked?.name).toBe('Tingting');
    const fallback = pickMandarinVoice([voice('zh-TW', 'Meijia'), voice('zh-HK', 'Sinji', true)]);
    expect(fallback?.name).toBe('Sinji');
  });
});

describe('findMandarinVoice', () => {
  it('resolves immediately when a voice is already loaded', async () => {
    const synth = { getVoices: () => [voice('zh-CN', 'Tingting')] };
    await expect(findMandarinVoice(synth)).resolves.toMatchObject({ name: 'Tingting' });
  });

  it('waits for voiceschanged when the voice list is populated asynchronously', async () => {
    let listener: (() => void) | null = null;
    let voices: SpeechSynthesisVoiceLike[] = [];
    const synth = {
      getVoices: () => voices,
      addEventListener: (_: string, callback: () => void) => {
        listener = callback;
      },
      removeEventListener: vi.fn(),
    };
    const pending = findMandarinVoice(synth, 5000);
    voices = [voice('zh-CN', 'Late')];
    listener!();
    await expect(pending).resolves.toMatchObject({ name: 'Late' });
    expect(synth.removeEventListener).toHaveBeenCalled();
  });

  it('resolves null after the timeout when no Mandarin voice ever appears', async () => {
    vi.useFakeTimers();
    try {
      const synth = {
        getVoices: () => [voice('en-US', 'Samantha')],
        addEventListener: () => {},
        removeEventListener: () => {},
      };
      const pending = findMandarinVoice(synth, 1000);
      vi.advanceTimersByTime(1001);
      await expect(pending).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
