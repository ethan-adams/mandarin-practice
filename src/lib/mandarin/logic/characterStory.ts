// Character Story data: turn one Han character into its component breakdown,
// radical, meaning, and etymology — the culture-first motivator (VISION.md).
// Source is public/hanzi-dict.json, extracted from Make Me a Hanzi (see
// scripts/build-hanzi-dict.mjs). Everything here is derived from that dictionary,
// so glosses stay honest — no invented history.
//
// Ancient-form glyphs (oracle-bone → seal) are deliberately NOT modelled yet:
// no free, well-licensed, well-covered dataset was found (hanziyuan / Wikimedia
// coverage + licensing is unresolved). The evolution view waits on that; today
// the story is component etymology + radical + a live stroke animation.

const IDC = /[⿰-⿻]/u;
const HAN = /\p{Script=Han}/u;

/** Raw entry shape in public/hanzi-dict.json (compact keys to keep it small). */
export type DictEntry = {
  def?: string;
  pinyin?: string;
  ids?: string;
  radical?: string;
  ety?: { t: string; hint?: string; phonetic?: string; semantic?: string };
};

export type HanziDict = Record<string, DictEntry>;

export type StoryComponent = {
  char: string;
  gloss: string | null;
  pinyin: string | null;
  /** Its part in this character, when the etymology says so. */
  role: 'semantic' | 'phonetic' | 'part';
};

export type CharStory = {
  char: string;
  pinyin: string | null;
  definition: string | null;
  radical: string | null;
  radicalGloss: string | null;
  components: StoryComponent[];
  etymology: string | null;
};

/** The leaf components of an IDS decomposition string, in reading order. */
export function decompositionLeaves(ids: string | undefined | null): string[] {
  if (!ids) return [];
  return [...ids].filter((ch) => HAN.test(ch) && !IDC.test(ch) && ch !== '？');
}

/** The dictionary's first gloss — its shortest honest meaning for a chip. */
export function shortGloss(def: string | undefined | null): string | null {
  if (!def) return null;
  const first = def.split(/[,;]/)[0]?.trim();
  return first || null;
}

/** A readable etymology sentence, or null when the data has none. */
export function etymologyText(entry: DictEntry): string | null {
  const ety = entry.ety;
  if (!ety) return null;
  if (ety.t === 'pictophonetic') {
    const parts: string[] = [];
    if (ety.semantic) parts.push(`meaning from ${ety.semantic}`);
    if (ety.phonetic) parts.push(`sound from ${ety.phonetic}`);
    const base = parts.length ? `A sound-and-meaning character: ${parts.join(', ')}.` : null;
    // The hint here is usually a bare gloss of the semantic part (e.g. "mind");
    // fold it in only when it adds something.
    if (base && ety.hint) return `${base} The ${ety.semantic ?? 'meaning'} part points to “${cleanHint(ety.hint)}”.`;
    return base ?? (ety.hint ? capitalize(cleanHint(ety.hint)) : null);
  }
  // ideographic / pictographic: the hint is already a sentence-like description.
  if (ety.hint) return capitalize(cleanHint(ety.hint));
  if (ety.t === 'pictographic') return 'A pictograph — the character pictures the thing itself.';
  return null;
}

// Some source hints trail off with a stray dash or reference glyph
// ("A bird flying toward the sky —"); tidy that so the sentence reads cleanly.
function cleanHint(s: string): string {
  return s.replace(/[\s—–-]+$/u, '').trim();
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resolve one character into its story using the loaded dictionary. */
export function buildStory(char: string, dict: HanziDict): CharStory {
  const entry = dict[char] ?? {};
  const ety = entry.ety;
  const leaves = decompositionLeaves(entry.ids).filter((c) => c !== char);

  const components: StoryComponent[] = leaves.map((c) => {
    const ce = dict[c];
    let role: StoryComponent['role'] = 'part';
    if (ety?.semantic === c) role = 'semantic';
    else if (ety?.phonetic === c) role = 'phonetic';
    return { char: c, gloss: shortGloss(ce?.def), pinyin: ce?.pinyin ?? null, role };
  });

  return {
    char,
    pinyin: entry.pinyin ?? null,
    definition: entry.def ?? null,
    radical: entry.radical ?? null,
    radicalGloss: entry.radical ? shortGloss(dict[entry.radical]?.def) : null,
    components,
    etymology: etymologyText(entry),
  };
}

// ---- Ancient forms (oracle → bronze → seal), from public/ancient/ ----

export type AncientEra = 'oracle' | 'bronze' | 'seal';
export type AncientForm = { era: AncientEra; url: string; label: string; cn: string };

const ERA_LABEL: Record<AncientEra, { label: string; cn: string }> = {
  oracle: { label: 'Oracle bone', cn: '甲骨文' },
  bronze: { label: 'Bronze', cn: '金文' },
  seal: { label: 'Seal', cn: '篆書' },
};

/** Ancient forms available for a character, oldest first (empty when none). */
export function ancientForms(char: string, manifest: Record<string, AncientEra[]>): AncientForm[] {
  return (manifest[char] ?? []).map((era) => ({
    era,
    url: `/ancient/${encodeURIComponent(char)}-${era}.svg`,
    label: ERA_LABEL[era].label,
    cn: ERA_LABEL[era].cn,
  }));
}

let manifestCache: Promise<Record<string, AncientEra[]>> | null = null;

/** Load and cache the ancient-form manifest; {} if it isn't present. */
export function loadAncientManifest(): Promise<Record<string, AncientEra[]>> {
  if (!manifestCache) {
    manifestCache = fetch('/ancient/manifest.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, AncientEra[]>>) : {}))
      .catch(() => ({}));
  }
  return manifestCache;
}

let cache: Promise<HanziDict> | null = null;

/** Load and cache the character dictionary (one fetch per session). */
export function loadHanziDict(): Promise<HanziDict> {
  if (!cache) {
    cache = fetch('/hanzi-dict.json', { cache: 'force-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`hanzi-dict ${r.status}`);
        return r.json() as Promise<HanziDict>;
      })
      .catch((error) => {
        // Never poison the cache: a failed load should be retryable.
        cache = null;
        throw error;
      });
  }
  return cache;
}
