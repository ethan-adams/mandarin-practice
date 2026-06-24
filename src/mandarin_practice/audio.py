from __future__ import annotations

import random
import subprocess
from datetime import datetime
from pathlib import Path

from mandarin_practice.cards import validate_lessons
from mandarin_practice.paths import AUDIO_DIR, STRUCTURED_DIR, ensure_project_dirs
from mandarin_practice.practice import _load_state, _record_attempt, _save_state, _select_cards


DEFAULT_ENGLISH_VOICE = "Samantha"
DEFAULT_MANDARIN_VOICE = "Sandy (Chinese (China mainland))"
DEFAULT_RECORD_SECONDS = 5


def _say(text: str, voice: str, rate: int) -> None:
    subprocess.run(["say", "-v", voice, "-r", str(rate), text], check=False)


def _play(path) -> None:
    subprocess.run(["afplay", str(path)], check=False)


def _record(path, seconds: int, input_device: str) -> bool:
    result = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "avfoundation",
            "-i",
            f":{input_device}",
            "-t",
            str(seconds),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(path),
        ],
        check=False,
    )
    return result.returncode == 0


def _session_dir() -> Path:
    target = AUDIO_DIR / "responses" / datetime.now().strftime("%Y%m%d-%H%M%S")
    target.mkdir(parents=True, exist_ok=True)
    return target


def speak_practice(
    latest: bool = False,
    lesson_id: str | None = None,
    limit: int = 10,
    mode: str = "review",
    seconds: int = DEFAULT_RECORD_SECONDS,
    english_voice: str = DEFAULT_ENGLISH_VOICE,
    mandarin_voice: str = DEFAULT_MANDARIN_VOICE,
    english_rate: int = 170,
    mandarin_rate: int = 150,
    input_device: str = "0",
    replay: bool = True,
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
        return

    state = _load_state()
    cards = [card for lesson in lessons for card in lesson.cards]
    cards = _select_cards(cards, state, mode=mode, limit=limit, seed=seed)
    if seed is None:
        random.shuffle(cards)
    if not cards:
        print("No cards matched this speak mode.")
        return

    session_dir = _session_dir()
    print(f"Saving responses to {session_dir}")
    print("Grant microphone access if macOS asks. Use q at the rating prompt to stop.")

    correct = 0
    attempted = 0
    for index, card in enumerate(cards, start=1):
        response_path = session_dir / f"{index:03d}-{card.id}.wav"
        print()
        print(f"[{index}/{len(cards)}] {card.lesson_id}")
        print(card.prompt_en)
        _say(card.prompt_en, voice=english_voice, rate=english_rate)

        input(f"Press return, then answer aloud. Recording lasts {seconds}s...")
        print("Recording...")
        if not _record(response_path, seconds=seconds, input_device=input_device):
            print("Recording failed. Check microphone permission or run `ffmpeg -f avfoundation -list_devices true -i ''`.")
            return

        print(card.answer_zh)
        if card.pinyin:
            print(card.pinyin)
        if card.notes:
            print(card.notes)
        _say(card.answer_zh, voice=mandarin_voice, rate=mandarin_rate)

        if replay:
            print("Your response:")
            _play(response_path)

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
    print(f"Responses: {session_dir}")
