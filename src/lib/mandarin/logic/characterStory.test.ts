import { describe, expect, it } from 'vitest';
import { ancientForms, buildStory, decompositionLeaves, etymologyText, shortGloss, type HanziDict } from './characterStory';

const dict: HanziDict = {
  好: { def: 'good, excellent, fine; proper', pinyin: 'hǎo', ids: '⿰女子', radical: '女', ety: { t: 'ideographic', hint: 'A woman 女 with a son 子' } },
  女: { def: 'woman, female; feminine', pinyin: 'nǚ', radical: '女' },
  子: { def: 'offspring, child; seed', pinyin: 'zǐ', radical: '子' },
  们: { def: 'plural marker', pinyin: 'men', ids: '⿰亻门', radical: '亻', ety: { t: 'pictophonetic', phonetic: '门', semantic: '亻', hint: 'people' } },
  亻: { def: 'man, person', pinyin: 'rén' },
  门: { def: 'gate, door', pinyin: 'mén' },
};

describe('decompositionLeaves', () => {
  it('drops the description operators and keeps components in order', () => {
    expect(decompositionLeaves('⿰女子')).toEqual(['女', '子']);
    expect(decompositionLeaves('⿱艹⿱人木')).toEqual(['艹', '人', '木']);
  });
  it('handles missing or unknown decompositions', () => {
    expect(decompositionLeaves(undefined)).toEqual([]);
    expect(decompositionLeaves('？')).toEqual([]);
  });
});

describe('shortGloss', () => {
  it('takes the first honest gloss segment', () => {
    expect(shortGloss('good, excellent, fine; proper')).toBe('good');
    expect(shortGloss(undefined)).toBeNull();
  });
});

describe('etymologyText', () => {
  it('uses the hint for ideographic characters', () => {
    expect(etymologyText(dict['好'])).toBe('A woman 女 with a son 子');
  });
  it('composes a sound-and-meaning sentence for pictophonetic characters', () => {
    const text = etymologyText(dict['们'])!;
    expect(text).toContain('meaning from 亻');
    expect(text).toContain('sound from 门');
  });
  it('trims a stray trailing dash from a source hint', () => {
    expect(etymologyText({ ety: { t: 'ideographic', hint: 'A bird flying toward the sky —' } })).toBe(
      'A bird flying toward the sky',
    );
  });
});

describe('buildStory', () => {
  it('breaks a character into components with their own glosses', () => {
    const story = buildStory('好', dict);
    expect(story.pinyin).toBe('hǎo');
    expect(story.radical).toBe('女');
    expect(story.radicalGloss).toBe('woman');
    expect(story.components.map((c) => c.char)).toEqual(['女', '子']);
    expect(story.components[0]).toMatchObject({ char: '女', gloss: 'woman', pinyin: 'nǚ', role: 'part' });
  });
  it('labels semantic and phonetic parts for pictophonetic characters', () => {
    const roles = Object.fromEntries(buildStory('们', dict).components.map((c) => [c.char, c.role]));
    expect(roles).toEqual({ 亻: 'semantic', 门: 'phonetic' });
  });
  it('degrades gracefully for an unknown character', () => {
    const story = buildStory('🙂', dict);
    expect(story).toMatchObject({ char: '🙂', pinyin: null, definition: null, components: [] });
  });
});

describe('ancientForms', () => {
  it('maps a manifest entry to ordered, labelled, self-hosted forms', () => {
    const forms = ancientForms('好', { 好: ['oracle', 'bronze', 'seal'] });
    expect(forms.map((f) => f.era)).toEqual(['oracle', 'bronze', 'seal']);
    expect(forms[0]).toMatchObject({ era: 'oracle', label: 'Oracle bone', cn: '甲骨文' });
    expect(forms[2].url).toBe('/ancient/%E5%A5%BD-seal.svg');
  });
  it('returns nothing for a character absent from the manifest', () => {
    expect(ancientForms('好', {})).toEqual([]);
  });
});
