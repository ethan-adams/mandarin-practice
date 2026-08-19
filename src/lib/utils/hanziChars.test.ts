import { describe, expect, it } from 'vitest';
import { charactersToPractice, hanziDataPath } from './hanziChars';

describe('charactersToPractice', () => {
  it('keeps Han characters in reading order', () => {
    expect(charactersToPractice('我想喝茶。')).toEqual(['我', '想', '喝', '茶']);
    expect(charactersToPractice('爱好')).toEqual(['爱', '好']);
  });

  it('drops punctuation, latin, digits, and whitespace', () => {
    expect(charactersToPractice('你好，世界')).toEqual(['你', '好', '世', '界']);
    expect(charactersToPractice('abc 123 ！')).toEqual([]);
  });

  it('keeps repeated characters (each is traced)', () => {
    expect(charactersToPractice('谢谢')).toEqual(['谢', '谢']);
  });

  it('handles empty/nullish input', () => {
    expect(charactersToPractice('')).toEqual([]);
    expect(charactersToPractice(undefined as unknown as string)).toEqual([]);
  });
});

describe('hanziDataPath', () => {
  it('points at the self-hosted, URL-encoded data file', () => {
    expect(hanziDataPath('好')).toBe(`/hanzi/${encodeURIComponent('好')}.json`);
  });
});
