import { describe, expect, it } from 'vitest';
import { displayPinyinSyllable } from './pinyin';

// Tone tiles render one pinyin token each; sentence punctuation carried by
// the raw token (e.g. "diào.") must never appear inside a tile.

describe('displayPinyinSyllable', () => {
  it('strips trailing ASCII punctuation', () => {
    expect(displayPinyinSyllable('diào.')).toBe('diào');
    expect(displayPinyinSyllable('ma?')).toBe('ma');
    expect(displayPinyinSyllable('hǎo!')).toBe('hǎo');
    expect(displayPinyinSyllable('ne,')).toBe('ne');
  });

  it('strips full-width CJK punctuation', () => {
    expect(displayPinyinSyllable('diào。')).toBe('diào');
    expect(displayPinyinSyllable('hǎo！')).toBe('hǎo');
    expect(displayPinyinSyllable('ma？')).toBe('ma');
  });

  it('strips leading punctuation such as quotes', () => {
    expect(displayPinyinSyllable('“nǐ')).toBe('nǐ');
  });

  it('preserves tone marks, umlauts, and digits', () => {
    expect(displayPinyinSyllable('lǜ.')).toBe('lǜ');
    expect(displayPinyinSyllable('nǚ')).toBe('nǚ');
    expect(displayPinyinSyllable('ma5,')).toBe('ma5');
  });

  it('returns an empty string for punctuation-only tokens', () => {
    expect(displayPinyinSyllable('。')).toBe('');
  });
});
