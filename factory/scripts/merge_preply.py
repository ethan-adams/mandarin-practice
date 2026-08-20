#!/usr/bin/env python3
"""Merge the factory's Preply tutor lessons into the app corpus as their own
"Preply" unit — WITHOUT destroying the HSK cards (bare `mandarin export` would
overwrite the whole file). Idempotent: re-running replaces the Preply track.

Reads factory lessons/structured/Ethan_*.json and public/mandarin-source.json,
appends Preply cards + a Preply unit, recomputes counts, writes the corpus back.

Usage (from factory/):
  uv run python scripts/merge_preply.py
"""
from __future__ import annotations

import glob
import hashlib
import json
import re
from pathlib import Path

FACTORY_ROOT = Path(__file__).resolve().parent.parent
STRUCTURED = FACTORY_ROOT / "lessons" / "structured"
CORPUS_PATH = FACTORY_ROOT.parent / "public" / "mandarin-source.json"

PREPLY_UNIT_ID = "preply"
MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def lesson_title(stem: str, date: str) -> str:
    m = re.match(r"Ethan_(\d{2})(\d{2})(\d{2})(?:-(\d+))?$", stem)
    if m:
        _yy, mm, dd, suffix = m.group(1), int(m.group(2)), int(m.group(3)), m.group(4)
        label = f"{MONTHS[mm]} {dd}" if 1 <= mm <= 12 else stem
        return f"{label} ({suffix})" if suffix else label
    return "Characters"


def sort_key(stem: str) -> str:
    m = re.match(r"Ethan_(\d{6})(?:-(\d+))?$", stem)
    return (m.group(1) + (m.group(2) or "0")) if m else "000000"


def card_id(lesson_id: str, prompt_en: str, answer_zh: str) -> str:
    digest = hashlib.sha1(f"{lesson_id}\n{prompt_en}\n{answer_zh}".encode("utf-8")).hexdigest()
    return f"preply-{digest[:12]}"


def main() -> None:
    corpus = json.loads(CORPUS_PATH.read_text(encoding="utf-8"))
    # Drop any previous Preply data so re-runs are clean.
    corpus["cards"] = [c for c in corpus.get("cards", []) if not str(c.get("lessonId", "")).startswith("Ethan_")]
    corpus["units"] = [u for u in corpus.get("units", []) if u.get("id") != PREPLY_UNIT_ID]

    lessons = []
    for path in glob.glob(str(STRUCTURED / "Ethan_*.json")):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        stem = data.get("lesson_id") or Path(path).stem
        cards = data.get("cards", [])
        if cards:
            lessons.append((stem, data.get("date", ""), cards))

    lessons.sort(key=lambda item: sort_key(item[0]))

    unit_lessons = []
    seen_ids: set[str] = set()
    added = 0
    for order, (stem, date, cards) in enumerate(lessons, start=1):
        count = 0
        for card in cards:
            prompt_en = (card.get("prompt_en") or card.get("prompt") or "").strip()
            answer_zh = (card.get("answer_zh") or card.get("answer") or "").strip()
            pinyin = (card.get("pinyin") or "").strip()
            if not (prompt_en and answer_zh):
                continue
            cid = card_id(stem, prompt_en, answer_zh)
            if cid in seen_ids:
                continue
            seen_ids.add(cid)
            app_card = {"id": cid, "lessonId": stem, "promptEn": prompt_en, "answerZh": answer_zh, "pinyin": pinyin}
            notes = (card.get("notes") or "").strip()
            if notes:
                app_card["notes"] = notes
            corpus["cards"].append(app_card)
            count += 1
            added += 1
        if count:
            unit_lessons.append({"id": stem, "title": lesson_title(stem, date), "order": order, "cardCount": count})

    corpus.setdefault("units", []).append({
        "id": PREPLY_UNIT_ID,
        "title": "Preply Tutoring",
        "order": 4,
        "lessons": unit_lessons,
    })

    corpus["card_count"] = len(corpus["cards"])
    corpus["lesson_count"] = len({c["lessonId"] for c in corpus["cards"]})
    CORPUS_PATH.write_text(json.dumps(corpus, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"merged {added} Preply cards across {len(unit_lessons)} lessons")
    print(f"corpus now: {corpus['card_count']} cards, {corpus['lesson_count']} lessons, {len(corpus['units'])} units")


if __name__ == "__main__":
    main()
