import { describe, expect, it } from 'vitest';

import { splitAroundWord } from './mandarinExamples';

describe('splitAroundWord', () => {
  it('marks the single occurrence of the word', () => {
    expect(splitAroundWord('我喜欢猫。', '喜欢')).toEqual([
      { text: '我', hit: false },
      { text: '喜欢', hit: true },
      { text: '猫。', hit: false },
    ]);
  });

  it('marks every occurrence', () => {
    expect(splitAroundWord('水和水', '水')).toEqual([
      { text: '水', hit: true },
      { text: '和', hit: false },
      { text: '水', hit: true },
    ]);
  });

  it('word at the very start and end', () => {
    expect(splitAroundWord('爱', '爱')).toEqual([{ text: '爱', hit: true }]);
  });

  it('returns the whole sentence unmarked when the word is absent', () => {
    expect(splitAroundWord('你好世界', '再见')).toEqual([{ text: '你好世界', hit: false }]);
  });

  it('empty word never highlights', () => {
    expect(splitAroundWord('你好', '')).toEqual([{ text: '你好', hit: false }]);
  });
});
