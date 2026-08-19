import { describe, expect, it } from 'vitest';
import { handleGraphQL } from '../backend/src/graphql';

const post = (query: string, variables?: Record<string, unknown>) =>
  new Request('https://api.test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

describe('Character subgraph', () => {
  it('reports course stats derived from the HSK corpus', async () => {
    const res = await handleGraphQL(post('{ course { characterCount lessonCount hskLevels } }'));
    const { data } = await res.json();
    expect(data.course.characterCount).toBeGreaterThan(2000);
    expect(data.course.hskLevels).toEqual([1, 2, 3]);
  });

  it('resolves a single character by its hanzi key', async () => {
    const res = await handleGraphQL(post('query($h:String!){ character(hanzi:$h){ pinyin glossEn hsk } }', { h: '爱' }));
    const { data } = await res.json();
    expect(data.character).toEqual({ pinyin: 'ai4', glossEn: 'to love', hsk: 1 });
  });

  it('filters characters by HSK level', async () => {
    const res = await handleGraphQL(post('{ characters(hsk: 3, limit: 5) { hsk } }'));
    const { data } = await res.json();
    expect(data.characters).toHaveLength(5);
    expect(data.characters.every((c: { hsk: number }) => c.hsk === 3)).toBe(true);
  });

  it('exposes the federation SDL via _service', async () => {
    const res = await handleGraphQL(post('{ _service { sdl } }'));
    const { data } = await res.json();
    expect(data._service.sdl).toContain('type Character @key(fields: "hanzi")');
  });

  it('resolves entity references from another subgraph via _entities', async () => {
    const res = await handleGraphQL(
      post('query($r:[_Any!]!){ _entities(representations:$r){ ... on Character { hanzi pinyin } } }', {
        r: [{ __typename: 'Character', hanzi: '好' }],
      }),
    );
    const { data } = await res.json();
    expect(data._entities[0]).toEqual({ hanzi: '好', pinyin: 'hao3' });
  });

  it('serves the SDL on a bare GET', async () => {
    const res = await handleGraphQL(new Request('https://api.test/graphql', { method: 'GET' }));
    expect(await res.text()).toContain('type Character @key');
  });
});
