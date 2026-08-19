// Job 2 of the Mandarin backend: the Character subgraph (the federation cold
// path). Read-only and corpus-derived — no user data — so it needs no database
// and stays free. `Character` is a federation entity keyed by its hanzi, so a
// router can compose it into the supergraph beside Draw and Loupe, and the Draw
// writing-practice mode can reference a Character to fetch its reference strokes.
//
// Scope note: this serves the practical queries (course/characters/character)
// and `_service { sdl }` so a router can fetch the SDL for composition. Full
// `_entities` resolution is the next increment (see ../../VISION.md, roadmap 2).

import { buildSchema, graphql, type ExecutionResult } from 'graphql';
import corpusData from './corpus.json';

type Character = { hanzi: string; pinyin: string; glossEn: string; hsk: number | null; lessonId: string };
const corpus = corpusData as { cardCount: number; lessonCount: number; characters: Character[] };
const byHanzi = new Map(corpus.characters.map((c) => [c.hanzi, c]));

// The authored subgraph SDL, returned by `_service { sdl }` for router composition.
const FEDERATION_SDL = `type Character @key(fields: "hanzi") {
  hanzi: String!
  pinyin: String!
  glossEn: String!
  hsk: Int
  lessonId: String!
}

type Course {
  id: ID!
  title: String!
  cardCount: Int!
  lessonCount: Int!
  characterCount: Int!
  hskLevels: [Int!]!
}

type Query {
  course: Course!
  characters(hsk: Int, limit: Int = 50): [Character!]!
  character(hanzi: String!): Character
}`;

// The executable schema also declares the @key directive and the federation
// runtime fields (`_service`, `_entities`) so buildSchema accepts the SDL, a
// router can introspect it, AND a router can resolve Character references that
// originate in another subgraph (e.g. Draw's writing-practice mode).
const schema = buildSchema(`
  directive @key(fields: String!) on OBJECT
  scalar _Any
  ${FEDERATION_SDL}
  union _Entity = Character
  type _Service { sdl: String! }
  extend type Query {
    _service: _Service!
    _entities(representations: [_Any!]!): [_Entity]!
  }
`);

// buildSchema can't attach a union resolver from SDL; Character is the only
// entity, so every _Entity resolves to it.
const entityType = schema.getType('_Entity');
if (entityType && 'resolveType' in entityType) {
  (entityType as { resolveType: () => string }).resolveType = () => 'Character';
}

const hskLevels = [...new Set(corpus.characters.map((c) => c.hsk).filter((n): n is number => n != null))].sort((a, b) => a - b);

const rootValue = {
  course: () => ({
    id: 'mandarin-hsk',
    title: 'Mandarin HSK 1–3',
    cardCount: corpus.cardCount,
    lessonCount: corpus.lessonCount,
    characterCount: corpus.characters.length,
    hskLevels,
  }),
  characters: ({ hsk, limit }: { hsk?: number | null; limit?: number }) => {
    const cap = Math.min(Math.max(limit ?? 50, 1), 500);
    return corpus.characters.filter((c) => hsk == null || c.hsk === hsk).slice(0, cap);
  },
  character: ({ hanzi }: { hanzi: string }) => byHanzi.get(hanzi) ?? null,
  _service: () => ({ sdl: FEDERATION_SDL }),
  // Federation entity resolution: a router hands us [{ __typename: "Character",
  // hanzi }] and we return the full Character it references.
  _entities: ({ representations }: { representations: Array<{ __typename?: string; hanzi?: string }> }) =>
    representations.map((r) => (r?.__typename === 'Character' && r.hanzi ? byHanzi.get(r.hanzi) ?? null : null)),
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function run(source: string, variableValues?: Record<string, unknown> | null, operationName?: string | null): Promise<Response> {
  const result: ExecutionResult = await graphql({
    schema,
    source,
    rootValue,
    variableValues: variableValues ?? undefined,
    operationName: operationName ?? undefined,
  });
  return json(200, result);
}

/** Handle `/graphql`: POST a query, or GET the SDL (or a `?query=` for quick checks). */
export async function handleGraphQL(request: Request): Promise<Response> {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const query = url.searchParams.get('query');
    if (!query) {
      return new Response(FEDERATION_SDL, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return run(query, null, url.searchParams.get('operationName'));
  }
  if (request.method !== 'POST') return json(405, { error: 'method not allowed' });

  let body: { query?: unknown; variables?: unknown; operationName?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  if (typeof body.query !== 'string') return json(400, { error: 'missing query' });
  return run(body.query, (body.variables as Record<string, unknown> | null) ?? null, (body.operationName as string | null) ?? null);
}
