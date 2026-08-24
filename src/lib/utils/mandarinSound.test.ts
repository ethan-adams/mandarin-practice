import { describe, it, expect, vi, beforeAll } from 'vitest';
import { tonelessSyllable, tonelessSyllables, bestSpokenResult, ensurePinyinLookup, compareBySound } from './mandarinSound';
import type { PronunciationResult } from './mandarinPronunciation';

beforeAll(async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        爱: { pinyin: 'ài' },
        哎: { pinyin: 'āi' },
        他: { pinyin: 'tā' },
        她: { pinyin: 'tā' },
        好: { pinyin: 'hǎo' },
        在: { pinyin: 'zài' },
        再: { pinyin: 'zài' },
      }),
    })),
  );
  await ensurePinyinLookup();
});

describe('tonelessSyllable', () => {
  it('strips tone marks and normalises ü', () => {
    expect(tonelessSyllable('ài')).toBe('ai');
    expect(tonelessSyllable('hǎo')).toBe('hao');
    expect(tonelessSyllable('lüè')).toBe('lüe');
    expect(tonelessSyllable('nv3')).toBe('nü');
    expect(tonelessSyllable(null)).toBeNull();
    expect(tonelessSyllable('')).toBeNull();
  });
  it('splits a full reading into syllables', () => {
    expect(tonelessSyllables('wǒ xiǎng')).toEqual(['wo', 'xiang']);
  });
});

describe('compareBySound — homophones count as correct pronunciation', () => {
  it('matches a homophone the recognizer picked (爱 heard as 哎)', () => {
    expect(compareBySound('ài', '哎')?.status).toBe('matched');
  });
  it('matches 他 heard as 她, and 在 heard as 再', () => {
    expect(compareBySound('tā', '她')?.status).toBe('matched');
    expect(compareBySound('zài', '再')?.status).toBe('matched');
  });
  it('still misses a genuinely different sound', () => {
    expect(compareBySound('hǎo', '他')?.status).toBe('missed');
  });
});

describe('bestSpokenResult', () => {
  const r = (status: PronunciationResult['status']): PronunciationResult => ({
    status,
    normalized_expected: '',
    normalized_transcript: '',
    similarity: 0,
  });
  it('upgrades to the sound result and flags soundMatch', () => {
    const { result, soundMatch } = bestSpokenResult(r('missed'), r('matched'));
    expect(result.status).toBe('matched');
    expect(soundMatch).toBe(true);
  });
  it('keeps the character result when it is at least as strong', () => {
    expect(bestSpokenResult(r('matched'), r('close')).soundMatch).toBe(false);
    expect(bestSpokenResult(r('close'), null).soundMatch).toBe(false);
  });
});
