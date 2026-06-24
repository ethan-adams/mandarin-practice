from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from mandarin_practice.paths import STRUCTURED_DIR, ensure_project_dirs


@dataclass(frozen=True)
class Card:
    lesson_id: str
    prompt_en: str
    answer_zh: str
    pinyin: str = ""
    notes: str = ""
    generated: bool = False

    @property
    def id(self) -> str:
        source = "\n".join([self.lesson_id, self.prompt_en, self.answer_zh])
        return hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]


@dataclass(frozen=True)
class Lesson:
    path: Path
    lesson_id: str
    date: str
    cards: list[Card]


def select_lesson_paths(latest: bool = False, lesson_id: str | None = None) -> list[Path]:
    ensure_project_dirs()
    if lesson_id:
        path = STRUCTURED_DIR / f"{lesson_id}.json"
        return [path] if path.exists() else []
    if latest:
        lessons = sorted(STRUCTURED_DIR.glob("Ethan_*.json"))
        return lessons[-1:] if lessons else []
    return sorted(STRUCTURED_DIR.glob("*.json"))


def load_lesson(path: Path) -> Lesson:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise ValueError(f"{path.name}: invalid JSON at line {error.lineno}: {error.msg}") from error

    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: top-level value must be an object")

    lesson_id = _required_string(data, "lesson_id", path.name)
    date = str(data.get("date", ""))
    raw_cards = data.get("cards")
    if not isinstance(raw_cards, list):
        raise ValueError(f"{path.name}: cards must be a list")

    cards = []
    for index, raw_card in enumerate(raw_cards, start=1):
        cards.append(_load_card(path.name, lesson_id, index, raw_card))

    return Lesson(path=path, lesson_id=lesson_id, date=date, cards=cards)


def load_cards(latest: bool = False, lesson_id: str | None = None) -> list[Card]:
    cards: list[Card] = []
    for path in select_lesson_paths(latest=latest, lesson_id=lesson_id):
        cards.extend(load_lesson(path).cards)
    return cards


def validate_lessons(latest: bool = False, lesson_id: str | None = None) -> tuple[list[Lesson], list[str]]:
    lessons = []
    errors = []
    paths = select_lesson_paths(latest=latest, lesson_id=lesson_id)
    if lesson_id and not paths:
        errors.append(f"No lesson found for {lesson_id}")
        return lessons, errors

    for path in paths:
        try:
            lessons.append(load_lesson(path))
        except ValueError as error:
            errors.append(str(error))
    return lessons, errors


def _load_card(filename: str, lesson_id: str, index: int, raw_card: object) -> Card:
    if not isinstance(raw_card, dict):
        raise ValueError(f"{filename}: card {index} must be an object")

    prompt = _first_string(raw_card, ["prompt_en", "prompt"])
    answer = _first_string(raw_card, ["answer_zh", "answer"])
    if not prompt:
        raise ValueError(f"{filename}: card {index} is missing prompt_en")
    if not answer:
        raise ValueError(f"{filename}: card {index} is missing answer_zh")

    return Card(
        lesson_id=lesson_id,
        prompt_en=prompt,
        answer_zh=answer,
        pinyin=_optional_string(raw_card, "pinyin"),
        notes=_optional_string(raw_card, "notes"),
        generated=bool(raw_card.get("generated", False)),
    )


def _required_string(data: dict, key: str, filename: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{filename}: {key} must be a non-empty string")
    return value.strip()


def _optional_string(data: dict, key: str) -> str:
    value = data.get(key, "")
    return value if isinstance(value, str) else str(value)


def _first_string(data: dict, keys: list[str]) -> str:
    for key in keys:
        value = data.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""
