from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from mandarin_practice.audio import (
    DEFAULT_EDGE_ENGLISH_VOICE,
    DEFAULT_EDGE_MANDARIN_VOICE,
    DEFAULT_ENGLISH_VOICE,
    DEFAULT_MANDARIN_VOICE,
    DEFAULT_SPEED_PRESET,
    MANDARIN_AUDIO_SPEEDS,
    SPEED_PRESETS,
    TTS_BACKENDS,
    _audio_metadata,
    _audio_metadata_with_speed,
    _available_say_voices,
    _build_audio_file,
    _metadata_path,
    _relative_path,
    _resolve_rates,
    _rates_for_speed_preset,
    _voice_for_card,
    _write_audio_metadata,
)
from mandarin_practice.cards import Card, validate_lessons
from mandarin_practice.paths import AUDIO_SESSIONS_DIR, STRUCTURED_DIR, ensure_project_dirs
from mandarin_practice.practice import _default_card_state, _load_state, _select_cards


SESSION_VERSION = 1
DEFAULT_SESSION_ID = "latest"
DEFAULT_RESPONSE_GAP_SECONDS = 5
SESSION_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$")


@dataclass
class SessionBuildStats:
    cards: int = 0
    generated: int = 0
    reused: int = 0
    failed_audio: int = 0
    metadata_written: int = 0
    fallback_used: int = 0
    manifest_path: Path | None = None


def build_session(
    latest: bool = False,
    lesson_id: str | None = None,
    limit: int = 10,
    mode: str = "review",
    session_id: str = DEFAULT_SESSION_ID,
    response_gap_seconds: int = DEFAULT_RESPONSE_GAP_SECONDS,
    tts_backend: str = "edge",
    english_voice: str = DEFAULT_ENGLISH_VOICE,
    mandarin_voice: str = DEFAULT_MANDARIN_VOICE,
    edge_english_voice: str = DEFAULT_EDGE_ENGLISH_VOICE,
    edge_voice: str = DEFAULT_EDGE_MANDARIN_VOICE,
    speed_preset: str = DEFAULT_SPEED_PRESET,
    english_rate: int | None = None,
    mandarin_rate: int | None = None,
    seed: int | None = None,
    voice_variety: bool = True,
) -> SessionBuildStats:
    ensure_project_dirs()
    if tts_backend not in TTS_BACKENDS:
        raise ValueError(f"Unknown TTS backend: {tts_backend}")
    if response_gap_seconds < 0:
        raise ValueError("response_gap_seconds must be non-negative")
    if not SESSION_ID_PATTERN.fullmatch(session_id):
        raise ValueError("session_id must be a simple folder name using letters, numbers, dot, dash, or underscore")
    english_rate, mandarin_rate = _resolve_rates(speed_preset, english_rate, mandarin_rate)

    lessons, errors = validate_lessons(latest=latest, lesson_id=lesson_id)
    if errors:
        print("Lesson validation failed:")
        for error in errors:
            print(f"  {error}")
        return SessionBuildStats(failed_audio=len(errors))
    if not lessons:
        print(f"No structured lessons found in {STRUCTURED_DIR}.")
        return SessionBuildStats()

    state = _load_state()
    cards = [card for lesson in lessons for card in lesson.cards]
    cards = _select_cards(cards, state, mode=mode, limit=limit, seed=seed)
    if not cards:
        print("No cards matched this session mode.")
        return SessionBuildStats()

    session_dir = AUDIO_SESSIONS_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = session_dir / "session.json"
    stats = SessionBuildStats(cards=len(cards), manifest_path=manifest_path)
    available_mandarin_voices = _available_say_voices()

    manifest_cards = []
    for index, card in enumerate(cards, start=1):
        answer_voice, answer_voice_label, rate_offset = _voice_for_card(
            index,
            fallback_voice=edge_voice if tts_backend == "edge" else mandarin_voice,
            voice_variety=voice_variety,
            available_voices=available_mandarin_voices,
            backend=tts_backend,
        )
        prompt_audio = _build_session_audio(
            stats=stats,
            card=card,
            role="prompt",
            text=card.prompt_en,
            backend=tts_backend,
            voice=edge_english_voice if tts_backend == "edge" else english_voice,
            fallback_voice=english_voice,
            rate=english_rate,
            speed_preset=speed_preset,
        )
        answer_audio_variants = {}
        answer_speeds = list(MANDARIN_AUDIO_SPEEDS)
        if speed_preset not in answer_speeds:
            answer_speeds.append(speed_preset)
        for answer_speed in answer_speeds:
            speed_rates = _rates_for_speed_preset(answer_speed)
            base_rate = mandarin_rate if answer_speed == speed_preset else speed_rates["mandarin_rate"]
            answer_audio_variants[answer_speed] = _build_session_audio(
                stats=stats,
                card=card,
                role="answer" if answer_speed == DEFAULT_SPEED_PRESET else f"answer_{answer_speed}",
                text=card.answer_zh,
                backend=tts_backend,
                voice=answer_voice,
                fallback_voice=mandarin_voice,
                rate=max(base_rate + rate_offset, 80),
                speed_preset=answer_speed,
            )
        answer_audio = answer_audio_variants.get(speed_preset) or answer_audio_variants.get(DEFAULT_SPEED_PRESET, "")
        rating_state = dict(state["cards"].get(card.id, _default_card_state(card)))

        manifest_cards.append(
            {
                "index": index,
                "card_id": card.id,
                "lesson_id": card.lesson_id,
                "prompt_text": card.prompt_en,
                "answer_text": card.answer_zh,
                "pinyin": card.display_pinyin,
                "notes": card.notes,
                "prompt_audio_path": prompt_audio,
                "answer_audio_path": answer_audio,
                "answer_audio_variants": answer_audio_variants,
                "answer_voice": answer_voice,
                "answer_voice_label": answer_voice_label,
                "rating_state": rating_state,
            }
        )

    manifest = {
        "version": SESSION_VERSION,
        "session_id": session_id,
        "selection": {
            "latest": latest,
            "lesson_id": lesson_id or "",
            "limit": limit,
            "mode": mode,
            "seed": seed,
        },
        "playback": {
            "response_gap_seconds": response_gap_seconds,
            "repeat_answer": False,
        },
        "audio": {
            "tts_backend": tts_backend,
            "english_voice": edge_english_voice if tts_backend == "edge" else english_voice,
            "mandarin_voice": edge_voice if tts_backend == "edge" else mandarin_voice,
            "speed_preset": speed_preset,
            "speed_presets": SPEED_PRESETS,
            "answer_speed_presets": list(MANDARIN_AUDIO_SPEEDS),
            "english_rate": english_rate,
            "mandarin_rate": mandarin_rate,
            "voice_variety": voice_variety,
        },
        "cards": manifest_cards,
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    print(f"Session cards: {stats.cards}")
    print(f"Session manifest: {manifest_path}")
    print(
        "Session audio: "
        f"generated={stats.generated} "
        f"reused={stats.reused} "
        f"failed={stats.failed_audio} "
        f"metadata={stats.metadata_written} "
        f"fallback={stats.fallback_used}"
    )
    return stats


def _build_session_audio(
    stats: SessionBuildStats,
    card: Card,
    role: str,
    text: str,
    backend: str,
    voice: str,
    fallback_voice: str,
    rate: int,
    speed_preset: str | None = None,
) -> str:
    path, actual_backend, actual_rate, reused, actual_voice = _build_audio_file(
        text=text,
        backend=backend,
        voice=voice,
        fallback_voice=fallback_voice,
        rate=rate,
    )
    if path is None:
        stats.failed_audio += 1
        print(f"fail {card.lesson_id} {card.id} {role}")
        return ""

    if reused:
        stats.reused += 1
    else:
        stats.generated += 1
    if actual_backend != backend:
        stats.fallback_used += 1

    metadata = _audio_metadata_with_speed(
        _audio_metadata(
            card=card,
            role=role,
            text=text,
            requested_backend=backend,
            actual_backend=actual_backend,
            voice=actual_voice,
            rate=actual_rate,
            audio_path=path,
        ),
        speed_preset,
    )
    _write_audio_metadata(_metadata_path(path), metadata)
    stats.metadata_written += 1
    return _relative_path(path)
