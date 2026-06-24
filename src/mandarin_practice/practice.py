from __future__ import annotations

import json
import random
import subprocess
from pathlib import Path

from mandarin_practice.paths import STRUCTURED_DIR, ensure_project_dirs


def _load_lesson(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _select_lessons(latest: bool, lesson_id: str | None) -> list[Path]:
    if lesson_id:
        path = STRUCTURED_DIR / f"{lesson_id}.json"
        return [path] if path.exists() else []
    if latest:
        lessons = sorted(STRUCTURED_DIR.glob("Ethan_*.json"))
        return lessons[-1:] if lessons else []
    lessons = sorted(STRUCTURED_DIR.glob("*.json"))
    return lessons


def _say(text: str) -> None:
    subprocess.run(["say", "-v", "Tingting", text], check=False)


def practice(latest: bool = False, lesson_id: str | None = None, limit: int = 0) -> None:
    ensure_project_dirs()
    lesson_paths = _select_lessons(latest=latest, lesson_id=lesson_id)
    if not lesson_paths:
        print(f"No structured lessons found in {STRUCTURED_DIR}.")
        print("Create a JSON file using the card format in README.md.")
        return

    cards = []
    for path in lesson_paths:
        lesson = _load_lesson(path)
        for card in lesson.get("cards", []):
            card = dict(card)
            card["_lesson_id"] = lesson.get("lesson_id", path.stem)
            cards.append(card)

    random.shuffle(cards)
    if limit > 0:
        cards = cards[:limit]

    correct = 0
    attempted = 0
    for index, card in enumerate(cards, start=1):
        prompt = card.get("prompt_en") or card.get("prompt") or ""
        answer = card.get("answer_zh") or card.get("answer") or ""
        pinyin = card.get("pinyin", "")
        notes = card.get("notes", "")

        print()
        print(f"[{index}/{len(cards)}] {card['_lesson_id']}")
        print(prompt)
        input("Press return for the answer...")
        print(answer)
        if pinyin:
            print(pinyin)
        if notes:
            print(notes)
        if answer:
            _say(answer)

        rating = input("Correct? [y/n/q] ").strip().lower()
        if rating == "q":
            break
        attempted += 1
        if rating in {"y", "yes"}:
            correct += 1

    if attempted:
        print()
        print(f"Score: {correct}/{attempted}")
