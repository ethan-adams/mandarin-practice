from __future__ import annotations

import json
import random
import subprocess
from datetime import date, datetime, timedelta

from mandarin_practice.cards import Card, load_cards, validate_lessons
from mandarin_practice.paths import STATE_DIR, STRUCTURED_DIR, ensure_project_dirs


STATE_VERSION = 1
REVIEW_STATE = STATE_DIR / "review.json"


def _load_state() -> dict:
    if not REVIEW_STATE.exists():
        return {"version": STATE_VERSION, "cards": {}}
    try:
        state = json.loads(REVIEW_STATE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        backup = REVIEW_STATE.with_suffix(".invalid.json")
        REVIEW_STATE.replace(backup)
        print(f"warn review state was invalid; moved it to {backup}")
        return {"version": STATE_VERSION, "cards": {}}
    if not isinstance(state, dict):
        return {"version": STATE_VERSION, "cards": {}}
    state.setdefault("version", STATE_VERSION)
    state.setdefault("cards", {})
    return state


def _save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_STATE.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _default_card_state(card: Card) -> dict:
    return {
        "lesson_id": card.lesson_id,
        "prompt_en": card.prompt_en,
        "answer_zh": card.answer_zh,
        "attempts": 0,
        "correct": 0,
        "misses": 0,
        "streak": 0,
        "interval_days": 0,
        "due": date.today().isoformat(),
        "last_seen": "",
    }


def _is_due(item: dict) -> bool:
    due = item.get("due", "")
    if not due:
        return True
    try:
        return date.fromisoformat(due) <= date.today()
    except ValueError:
        return True


def _record_attempt(state: dict, card: Card, rating: str) -> None:
    item = state["cards"].setdefault(card.id, _default_card_state(card))
    item.update(
        {
            "lesson_id": card.lesson_id,
            "prompt_en": card.prompt_en,
            "answer_zh": card.answer_zh,
            "last_seen": datetime.now().isoformat(timespec="seconds"),
        }
    )
    item["attempts"] = int(item.get("attempts", 0)) + 1

    if rating in {"y", "yes"}:
        item["correct"] = int(item.get("correct", 0)) + 1
        item["streak"] = int(item.get("streak", 0)) + 1
        previous_interval = int(item.get("interval_days", 0))
        interval = 1 if previous_interval < 1 else min(previous_interval * 2, 30)
    elif rating in {"h", "hard"}:
        item["misses"] = int(item.get("misses", 0)) + 1
        item["streak"] = 0
        interval = 1
    else:
        item["misses"] = int(item.get("misses", 0)) + 1
        item["streak"] = 0
        interval = 0

    item["interval_days"] = interval
    item["due"] = (date.today() + timedelta(days=interval)).isoformat()


def _say(text: str, audio: bool) -> None:
    if audio:
        subprocess.run(["say", "-v", "Tingting", text], check=False)


def _priority(card: Card, state: dict) -> tuple:
    item = state["cards"].get(card.id, _default_card_state(card))
    attempts = int(item.get("attempts", 0))
    misses = int(item.get("misses", 0))
    correct = int(item.get("correct", 0))
    accuracy = correct / attempts if attempts else 0
    due_rank = 0 if _is_due(item) else 1
    new_rank = 0 if attempts == 0 else 1
    return (due_rank, new_rank, -misses, accuracy, card.lesson_id, card.prompt_en)


def _select_cards(cards: list[Card], state: dict, mode: str, limit: int, seed: int | None) -> list[Card]:
    if mode == "review":
        selected = [card for card in cards if _is_due(state["cards"].get(card.id, _default_card_state(card)))]
    elif mode == "new":
        selected = [card for card in cards if int(state["cards"].get(card.id, {}).get("attempts", 0)) == 0]
    else:
        selected = list(cards)

    selected.sort(key=lambda card: _priority(card, state))
    if seed is not None:
        rng = random.Random(seed)
        due = [card for card in selected if _priority(card, state)[0] == 0]
        later = [card for card in selected if _priority(card, state)[0] != 0]
        rng.shuffle(due)
        rng.shuffle(later)
        selected = due + later

    if limit > 0:
        selected = selected[:limit]
    return selected


def practice(
    latest: bool = False,
    lesson_id: str | None = None,
    limit: int = 0,
    mode: str = "all",
    audio: bool = True,
    seed: int | None = None,
) -> None:
    ensure_project_dirs()
    lessons, errors = validate_lessons(latest=latest, lesson_id=lesson_id)
    if errors:
        print("Lesson validation failed:")
        for error in errors:
            print(f"  {error}")
        return
    if not lessons:
        print(f"No structured lessons found in {STRUCTURED_DIR}.")
        print("Create a JSON file using the card format in README.md.")
        return

    cards = [card for lesson in lessons for card in lesson.cards]
    state = _load_state()
    cards = _select_cards(cards, state, mode=mode, limit=limit, seed=seed)
    if not cards:
        print("No cards matched this practice mode.")
        return

    correct = 0
    attempted = 0
    for index, card in enumerate(cards, start=1):
        print()
        print(f"[{index}/{len(cards)}] {card.lesson_id}")
        print(card.prompt_en)
        input("Press return for the answer...")
        print(card.answer_zh)
        if card.pinyin:
            print(card.pinyin)
        if card.notes:
            print(card.notes)
        _say(card.answer_zh, audio=audio)

        rating = input("Mark [y]es / [h]ard / [n]o / [q]uit: ").strip().lower()
        if rating == "q":
            break
        if rating not in {"y", "yes", "h", "hard", "n", "no", ""}:
            rating = "n"
        if rating == "":
            rating = "n"

        attempted += 1
        if rating in {"y", "yes"}:
            correct += 1
        _record_attempt(state, card, rating)
        _save_state(state)

    if attempted:
        print()
        print(f"Score: {correct}/{attempted}")
        print(f"Review state: {REVIEW_STATE}")


def stats() -> None:
    ensure_project_dirs()
    cards = load_cards()
    state = _load_state()
    known_ids = {card.id for card in cards}
    tracked = [item for card_id, item in state["cards"].items() if card_id in known_ids]
    due = sum(1 for card in cards if _is_due(state["cards"].get(card.id, _default_card_state(card))))
    attempted = sum(1 for item in tracked if int(item.get("attempts", 0)) > 0)
    misses = sum(int(item.get("misses", 0)) for item in tracked)
    correct = sum(int(item.get("correct", 0)) for item in tracked)
    attempts = sum(int(item.get("attempts", 0)) for item in tracked)
    accuracy = correct / attempts if attempts else 0

    print(f"Cards: {len(cards)}")
    print(f"Attempted: {attempted}")
    print(f"Due today: {due}")
    print(f"Misses: {misses}")
    print(f"Accuracy: {accuracy:.0%}" if attempts else "Accuracy: n/a")
    print(f"State: {REVIEW_STATE}")
