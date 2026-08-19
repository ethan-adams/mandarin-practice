"""Export structured tutor lessons into the Svelte app's corpus format.

This is the bridge that makes the factory and the app one product: it reads the
same cards the practice/session commands use and writes the exact
`mandarin-source.json` the app loads at startup, mapping the factory's snake_case
Card fields to the app's camelCase schema. Run it after `validate`/`expand` to
push fresh tutor lessons into the app:

    uv run mandarin export            # writes ../public/mandarin-source.json
    uv run mandarin export --latest   # only the newest lesson
"""

from __future__ import annotations

import json
from pathlib import Path

from mandarin_practice.cards import Card, load_cards
from mandarin_practice.paths import PROJECT_ROOT

# The app lives at the monorepo root; its corpus is served from public/.
DEFAULT_EXPORT_PATH = PROJECT_ROOT.parent / "public" / "mandarin-source.json"


def _card_to_app(card: Card) -> dict:
    entry: dict[str, str] = {
        "id": card.id,
        "lessonId": card.lesson_id,
        "promptEn": card.prompt_en,
        "answerZh": card.answer_zh,
        # The app expects numbered pinyin (e.g. "wo3 xiang3"); the factory stores
        # it that way and only accents it for display.
        "pinyin": card.pinyin,
    }
    if card.notes:
        entry["notes"] = card.notes
    return entry


def build_corpus(cards: list[Card]) -> dict:
    """Shape a card list into the app's corpus payload (units omitted: the app
    derives friendly lesson groupings from lessonId on its own)."""
    lesson_ids: list[str] = []
    seen: set[str] = set()
    for card in cards:
        if card.lesson_id not in seen:
            seen.add(card.lesson_id)
            lesson_ids.append(card.lesson_id)
    return {
        "card_count": len(cards),
        "lesson_count": len(lesson_ids),
        "cards": [_card_to_app(card) for card in cards],
    }


def export_corpus(
    out: Path = DEFAULT_EXPORT_PATH,
    latest: bool = False,
    lesson_id: str | None = None,
) -> tuple[int, int, Path]:
    """Write the app corpus JSON. Returns (card_count, lesson_count, path)."""
    cards = load_cards(latest=latest, lesson_id=lesson_id)
    corpus = build_corpus(cards)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(corpus, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return corpus["card_count"], corpus["lesson_count"], out
