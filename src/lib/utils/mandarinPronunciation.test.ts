import { describe, expect, it } from 'vitest';
import {
  alignMandarinSpeechUnits,
  combineRecognitionResults,
  comparePronunciation,
  composeUnitPronunciationFeedback,
  normalizeMandarinText,
} from './mandarinPronunciation';

describe('Mandarin pronunciation comparison', () => {
  it('normalizes punctuation, whitespace, and simple variants', () => {
    expect(normalizeMandarinText('妳 喝 茶嗎？')).toBe('你喝茶吗');
  });

  it('matches exact normalized transcripts', () => {
    const result = comparePronunciation('我喝茶。', '我 喝 茶');

    expect(result.status).toBe('matched');
    expect(result.similarity).toBe(1);
  });

  it('treats partial overlapping Mandarin as close', () => {
    expect(comparePronunciation('你想喝什么？', '想喝什么').status).toBe('close');
  });

  it('reports empty transcripts as no speech', () => {
    expect(comparePronunciation('我喝茶。', '').status).toBe('no_speech');
  });

  it('marks unrelated transcripts as missed', () => {
    expect(comparePronunciation('我喝茶。', '今天下雨').status).toBe('missed');
  });

  it('aligns expected units in order, including repeated characters', () => {
    const alignment = alignMandarinSpeechUnits('你好吗你', '你你');

    expect(alignment.observed).toEqual(['你', null, null, '你']);
    expect(alignment.matchedCount).toBe(2);
  });

  it('does not give a full match to an unordered character overlap', () => {
    expect(comparePronunciation('我想喝茶', '茶喝想我').status).toBe('missed');
  });

  it('requires both recognition and tone evidence for a matched syllable', () => {
    expect(composeUnitPronunciationFeedback({
      observed: '妈',
      hasTranscript: true,
      tone: { status: 'matched', observed: 'level' },
    })).toMatchObject({ status: 'matched' });

    expect(composeUnitPronunciationFeedback({
      observed: null,
      hasTranscript: true,
      tone: { status: 'matched', observed: 'level' },
    })).toMatchObject({ status: 'missed' });

    expect(composeUnitPronunciationFeedback({
      observed: '妈',
      hasTranscript: true,
      tone: { status: 'missed', observed: 'rising' },
    })).toMatchObject({ status: 'missed' });
  });

  it('keeps a tone-only result explicitly unverified', () => {
    const result = composeUnitPronunciationFeedback({
      observed: null,
      hasTranscript: false,
      tone: { status: 'matched', observed: 'level' },
    });

    expect(result.status).toBe('unverified');
    expect(result.detail).toContain('syllable unverified');
  });

  it('combines the best alternative from every recognition segment', () => {
    const result = combineRecognitionResults([
      [
        { transcript: '我想', confidence: 0.92 },
        { transcript: '我向', confidence: 0.4 },
      ],
      [
        { transcript: '喝茶', confidence: 0.88 },
        { transcript: '和他', confidence: 0.3 },
      ],
    ]);

    expect(result.transcript).toBe('我想喝茶');
    expect(result.confidence).toBeCloseTo(0.9);
  });
});
