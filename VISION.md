# Mandarin Practice — Vision & Direction

The durable "why and where" for this app, so the direction never has to be
re-explained. Read this before making architectural changes. Tickets and plans
are checked against *this* and against the actual code, not the other way around.

## What the app is

A browser tool for practicing Mandarin: call-and-response cards, spaced
repetition, listening drills, and experimental tone/pronunciation feedback.
Svelte 5 + Vite + TypeScript. Historically: **no backend, no accounts, no
tracking** — everything runs in the browser and progress lives in `localStorage`.

That local-first, free, private character is a feature, not an accident. The
direction below *extends* it without betraying it.

## Where it's going

Two threads, and the good part is that they're really one idea.

### 1. Writing practice (draw characters, Duolingo-style)

Let people trace Chinese characters on a phone and get scored on stroke order,
direction, and shape. The reusable primitive comes from the **Draw** app
(`../liveboard`, whose README is literally titled "# Draw"): freehand ink
capture on a canvas. What Draw does *not* give us — and what is the real build —
is **stroke scoring against a reference** (via Make Me a Hanzi stroke-order
data). Draw's collaborative backend (stateless fan-out, Redis pub/sub, 500
concurrent clients) is irrelevant here: writing practice is single-user and
ephemeral. Draw is React; this app is Svelte — the concept ports, the code is
re-implemented.

### 2. The GraphQL substructure (federation)

Each tool in the family exposes its own **gqlgen/GraphQL subgraph**, and a
**router composes them into one supergraph** that a portfolio homepage can query
in a single shot. Draw already does this (`../liveboard/GRAPHQL.md`): `Board` is
a federation entity (`@key(fields: "id")`). Loupe exposes a subgraph too. This
app should join that supergraph.

### The idea that unifies both

**`Character` becomes a shared federation entity that Mandarin owns and Draw
references.** Mandarin owns the character knowledge — `hanzi`, pinyin, HSK level,
and reference stroke data — keyed `@key(fields: "hanzi")`. When Draw is in
writing-practice mode and you trace 好, it references that `Character` across the
supergraph to fetch the reference strokes and score the trace. Two separate
tools, stitched by the supergraph — federation earning its keep, not federation
for its own sake. Payoff: a portfolio homepage runs one query and shows Draw's
boards, Loupe's runs, and Mandarin's HSK coverage side by side.

## The backend

The app now has a backend — a **single small Cloudflare Worker** (TypeScript,
free tier, ~$0) that does two jobs. This is the one infrastructure choice, and
it's justified: Cloudflare Workers + KV is free at this scale, runs TS natively
(matching the frontend), and needs no servers to babysit. It replaces nothing on
the client; the client stays the source of truth.

The two jobs mirror Draw's deliberate two-transports rule (opaque high-churn
data must not go through GraphQL; rare typed reads do):

### Job 1 — Encrypted progress sync (the "save my progress" part)

The crucial feature. Practice on a laptop, pick it up on a phone, and the SRS
schedule and streak follow you — **without heavy auth**.

- **Local-first.** The client is authoritative. The server is a dumb blob store.
- **Client-side encryption.** The progress snapshot is encrypted in the browser
  (WebCrypto AES-GCM, key derived by PBKDF2) before it ever leaves the device.
  The server stores an **opaque blob** and can't read it.
- **No accounts.** Your identity is a high-entropy **sync code** (bearer secret).
  It derives two things by domain-separated hashing: a non-secret **blob id** the
  server keys on, and the **encryption key**. Type the code into another device
  to link it. No email, no password, no PII — consistent with "no tracking."
- **Merge, not overwrite.** Two devices reconcile by a field-aware merge
  (per-card: keep the more-progressed state; practice-days: set union; counts:
  max). A learning app used on two devices must never clobber a day of reviews.

**Threat model (honest):** the sync code is a bearer secret — anyone who has it
has full read/write to that progress. Acceptable for a personal learning tool,
and strictly better than storing emails/passwords we'd have to protect. The
server sees blob sizes and timestamps, and could delete a blob (availability,
not confidentiality). Losing the code means losing the synced copy (the local
copy is unaffected) — by design, since we hold no recovery data.

Transport: plain REST on the Worker (`/v1/blob/:id`, PUT/GET/DELETE). Opaque
bytes don't benefit from a typed graph.

### Job 2 — The `Character` subgraph (federation)

The typed cold path at `/graphql`. Corpus-derived, **read-only, no user data** —
so it stays free and needs no database (data is derived from the shipped HSK
corpus). Exposes `Character` (`@key(fields: "hanzi")`) and `Course`/HSK stats,
ready to federate into the supergraph beside Draw and Loupe.

Progress stays **encrypted and private** and is deliberately *not* in the graph.
If the portfolio homepage ever wants to show a real personal streak, the user
can opt in to publishing a small **non-sensitive summary** (streak, characters
learned) separately — never the full history. Not built yet; noted so the door
stays open.

## Roadmap (in order; each step ships value on its own)

1. **Encrypted progress sync** — client crypto + merge + Cloudflare Worker.
   *Done and LIVE at `https://mandarin-backend.ethanadams.workers.dev`
   (KV namespace `SYNC`, workers.dev subdomain `ethanadams`). App wired via
   `VITE_SYNC_URL` in `.env`. All endpoints verified against the deployment.*
2. **`Character` subgraph** — `@key(fields: "hanzi")`, corpus-derived, on the
   same Worker. *Done: `course`/`characters`/`character` queries, `_service`
   SDL, and `_entities` federation resolution, all tested.*
3. **Writing practice widget** — Svelte stroke canvas (hanzi-writer) with
   self-hosted stroke data (no external requests). *Done: opt-in per card,
   traces each character with stroke-order scoring; shipped and tested.*
4. **Federate Draw's writing mode** to reference `Character` across the
   supergraph — the real cross-app demo. *Next.*
5. **Portfolio homepage** — one supergraph query across Draw, Loupe, Mandarin.
   *Next.*

## Guardrails

- **No monthly costs.** Free tiers and local compute only. The Cloudflare Worker
  free tier is the deliberate, justified exception (still $0).
- **Local-first stays sacred.** The client is always the source of truth;
  the app must keep working fully offline with the backend unreachable.
- **Privacy stays sacred.** Progress is encrypted client-side; the server never
  sees plaintext or PII.
- **Backdirect-compatible storage.** The `localStorage` keys and SRS shape are
  load-bearing for existing users; sync must preserve them, never migrate
  silently.
