#!/usr/bin/env python3
"""Offline prebuilt-audio pipeline for the Mandarin app corpus.

Reads the app's public/mandarin-source.json, generates one MP3 per unique
`answerZh` string with Edge neural TTS (free, no key), stages the clips locally
under lessons/audio/corpus/, and records a text->key manifest. A second phase
injects a per-card `audioUrl` into the corpus so the app plays a stored URL
instead of synthesizing on the fly. See ../../VISION.md ("Prebuilt stored audio").

Clip keys are content-addressed by (voice, text), so runs are incremental: only
new/changed strings are generated, and the whole thing is safe to re-run after
the Preply track is merged in.

Usage (from factory/):
  uv run --extra edge python scripts/gen_corpus_audio.py generate [--limit N] [--concurrency 8]
  uv run --extra edge python scripts/gen_corpus_audio.py inject --base-url https://.../v1/audio
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path

FACTORY_ROOT = Path(__file__).resolve().parent.parent
CORPUS_PATH = FACTORY_ROOT.parent / "public" / "mandarin-source.json"
AUDIO_ROOT = FACTORY_ROOT / "lessons" / "audio" / "corpus"
CLIPS_SUBDIR = "clips/v1"  # bump when the voice/model changes
MANIFEST_PATH = AUDIO_ROOT / "manifest.json"

VOICE = "zh-CN-XiaoxiaoNeural"


def clip_key(text: str) -> str:
    digest = hashlib.sha1(f"{VOICE}|{text}".encode("utf-8")).hexdigest()[:32]
    return f"{CLIPS_SUBDIR}/{digest}.mp3"


def load_corpus() -> dict:
    return json.loads(CORPUS_PATH.read_text(encoding="utf-8"))


def unique_texts(corpus: dict) -> list[str]:
    seen: dict[str, None] = {}
    for card in corpus.get("cards", []):
        text = (card.get("answerZh") or "").strip()
        if text:
            seen.setdefault(text, None)
    return list(seen)


async def synth_one(sem: asyncio.Semaphore, text: str, out_path: Path, retries: int = 3) -> bool:
    import edge_tts

    if out_path.exists() and out_path.stat().st_size > 0:
        return True
    out_path.parent.mkdir(parents=True, exist_ok=True)
    async with sem:
        for attempt in range(1, retries + 1):
            try:
                tmp = out_path.with_suffix(".part")
                communicate = edge_tts.Communicate(text=text, voice=VOICE)
                # Guard against a hung connection stalling the whole batch.
                await asyncio.wait_for(communicate.save(str(tmp)), timeout=30)
                if tmp.stat().st_size == 0:
                    raise RuntimeError("empty audio")
                tmp.replace(out_path)
                return True
            except Exception as exc:  # noqa: BLE001 - edge service is flaky; retry
                if attempt == retries:
                    print(f"  FAIL after {retries}: {text!r}: {exc}", file=sys.stderr)
                    return False
                await asyncio.sleep(0.6 * attempt)
    return False


async def generate(limit: int, concurrency: int) -> None:
    corpus = load_corpus()
    texts = unique_texts(corpus)
    if limit:
        texts = texts[:limit]
    manifest = {"version": 1, "voice": VOICE, "key_prefix": CLIPS_SUBDIR, "entries": {}}
    if MANIFEST_PATH.exists():
        try:
            prev = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
            if prev.get("voice") == VOICE:
                manifest["entries"] = prev.get("entries", {})
        except Exception:  # noqa: BLE001
            pass

    sem = asyncio.Semaphore(concurrency)
    total = len(texts)
    print(f"corpus: {len(corpus.get('cards', []))} cards, {total} unique answers, voice {VOICE}")

    done = 0
    failed = 0
    tasks = []
    for text in texts:
        key = clip_key(text)
        manifest["entries"][text] = key
        tasks.append((text, AUDIO_ROOT / key))

    async def run(text: str, path: Path):
        nonlocal done, failed
        ok = await synth_one(sem, text, path)
        done += 1
        if not ok:
            failed += 1
        if done % 100 == 0 or done == total:
            print(f"  {done}/{total} ({failed} failed)")

    await asyncio.gather(*(run(t, p) for t, p in tasks))

    AUDIO_ROOT.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    on_disk = sum(1 for p in (AUDIO_ROOT / CLIPS_SUBDIR).glob("*.mp3"))
    size_mb = sum(p.stat().st_size for p in (AUDIO_ROOT / CLIPS_SUBDIR).glob("*.mp3")) / 1e6
    print(f"generated: {total - failed}/{total}; clips on disk: {on_disk}; total {size_mb:.1f} MB")
    print(f"manifest: {MANIFEST_PATH}")


def inject(base_url: str, target: Path) -> None:
    base = base_url.rstrip("/")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    entries = manifest["entries"]
    corpus = load_corpus()
    hit = 0
    miss = 0
    for card in corpus.get("cards", []):
        text = (card.get("answerZh") or "").strip()
        key = entries.get(text)
        if key:
            card["audioUrl"] = f"{base}/{key}"
            hit += 1
        else:
            card.pop("audioUrl", None)
            miss += 1
    corpus["audio"] = {"voice": VOICE, "base_url": base, "key_prefix": CLIPS_SUBDIR}
    target.write_text(json.dumps(corpus, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"injected audioUrl into {hit} cards ({miss} without audio); wrote {target}")


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("generate")
    g.add_argument("--limit", type=int, default=0)
    g.add_argument("--concurrency", type=int, default=8)
    i = sub.add_parser("inject")
    i.add_argument("--base-url", required=True)
    i.add_argument("--out", default=str(CORPUS_PATH))
    args = ap.parse_args()

    if args.cmd == "generate":
        asyncio.run(generate(args.limit, args.concurrency))
    elif args.cmd == "inject":
        inject(args.base_url, Path(args.out))


if __name__ == "__main__":
    main()
