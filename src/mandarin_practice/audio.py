from __future__ import annotations

import asyncio
import hashlib
import json
import random
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from mandarin_practice.cards import Card, validate_lessons
from mandarin_practice.paths import AUDIO_CACHE_DIR, AUDIO_DIR, PROJECT_ROOT, STRUCTURED_DIR, ensure_project_dirs
from mandarin_practice.practice import _load_state, _record_attempt, _save_state, _select_cards


DEFAULT_ENGLISH_VOICE = "Samantha"
DEFAULT_MANDARIN_VOICE = "Sandy (Chinese (China mainland))"
DEFAULT_EDGE_ENGLISH_VOICE = "en-US-JennyNeural"
DEFAULT_EDGE_MANDARIN_VOICE = "zh-CN-XiaoxiaoNeural"
DEFAULT_AZURE_MANDARIN_VOICE = DEFAULT_EDGE_MANDARIN_VOICE
DEFAULT_RECORD_SECONDS = 5
TTS_BACKENDS = ("say", "edge", "azure")


@dataclass(frozen=True)
class VoiceProfile:
    label: str
    preferred_names: tuple[str, ...]
    edge_voice: str
    azure_voice: str
    rate_offset: int = 0


@dataclass
class AudioBuildStats:
    generated: int = 0
    reused: int = 0
    failed: int = 0
    metadata_written: int = 0
    fallback_used: int = 0

    @property
    def total(self) -> int:
        return self.generated + self.reused + self.failed


MANDARIN_VOICE_PROFILES = [
    VoiceProfile("adult female", ("Sandy", "Tingting", "Mei-Jia"), "zh-CN-XiaoxiaoNeural", "zh-CN-XiaoxiaoNeural"),
    VoiceProfile("younger male", ("Yunjian", "Kangkang", "Sinji"), "zh-CN-YunxiNeural", "zh-CN-YunxiNeural", rate_offset=-8),
    VoiceProfile("adult male", ("Yunjian", "Kangkang", "Sinji"), "zh-CN-YunjianNeural", "zh-CN-YunjianNeural", rate_offset=-12),
    VoiceProfile("younger female", ("Xiaoyi", "Xiaoxiao", "Tingting"), "zh-CN-XiaoyiNeural", "zh-CN-XiaoyiNeural", rate_offset=4),
]


def _say(text: str, voice: str, rate: int) -> None:
    subprocess.run(["say", "-v", voice, "-r", str(rate), text], check=False)


def _save_say_audio(text: str, voice: str, rate: int, path: Path) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["say", "-v", voice, "-r", str(rate), "-o", str(path), text],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    return result.returncode == 0 and path.exists()


def _available_say_voices() -> list[str]:
    result = subprocess.run(["say", "-v", "?"], check=False, capture_output=True, text=True)
    if result.returncode != 0:
        return []
    voices = []
    for line in result.stdout.splitlines():
        if "zh_" not in line and "Chinese" not in line:
            continue
        name = line.split(maxsplit=1)[0]
        if name:
            voices.append(name)
    return voices


def _voice_for_card(
    index: int,
    fallback_voice: str,
    voice_variety: bool,
    available_voices: list[str],
    backend: str,
) -> tuple[str, str, int]:
    if not voice_variety:
        return fallback_voice, "single voice", 0

    profile = MANDARIN_VOICE_PROFILES[(index - 1) % len(MANDARIN_VOICE_PROFILES)]
    if backend == "edge":
        return profile.edge_voice, profile.label, profile.rate_offset
    if backend == "azure":
        return profile.azure_voice, profile.label, profile.rate_offset

    for preferred in profile.preferred_names:
        match = next((voice for voice in available_voices if preferred.lower() in voice.lower()), None)
        if match:
            return match, profile.label, profile.rate_offset

    if available_voices:
        return available_voices[(index - 1) % len(available_voices)], profile.label, profile.rate_offset
    return fallback_voice, profile.label, profile.rate_offset


def _play(path) -> None:
    subprocess.run(["afplay", str(path)], check=False)


def _edge_rate(rate: int) -> str:
    percent = round(((rate - 150) / 150) * 100) - 10
    percent = max(min(percent, 50), -50)
    return f"{percent:+d}%"


def _audio_cache_path(backend: str, voice: str, rate: str | int, text: str, suffix: str) -> Path:
    payload = {
        "backend": backend,
        "voice": voice,
        "rate": str(rate),
        "text": text,
    }
    digest = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    return AUDIO_CACHE_DIR / f"{digest[:24]}.{suffix}"


def _text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _metadata_path(audio_path: Path) -> Path:
    return audio_path.with_suffix(audio_path.suffix + ".json")


def _relative_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def _audio_metadata(
    card: Card,
    role: str,
    text: str,
    requested_backend: str,
    actual_backend: str,
    voice: str,
    rate: str | int,
    audio_path: Path,
) -> dict:
    return {
        "version": 1,
        "card_id": card.id,
        "lesson_id": card.lesson_id,
        "role": role,
        "text": text,
        "text_hash": _text_hash(text),
        "requested_backend": requested_backend,
        "backend": actual_backend,
        "voice": voice,
        "rate": str(rate),
        "audio_path": _relative_path(audio_path),
        "generated_at": datetime.now().isoformat(timespec="seconds"),
    }


def _write_audio_metadata(path: Path, metadata: dict) -> None:
    path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


async def _save_edge_audio(text: str, voice: str, rate: str, path: Path) -> None:
    import edge_tts

    communicate = edge_tts.Communicate(text=text, voice=voice, rate=rate)
    await communicate.save(str(path))


def _edge(text: str, voice: str, rate: int) -> bool:
    edge_rate = _edge_rate(rate)
    path = _audio_cache_path("edge", voice, edge_rate, text, "mp3")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            asyncio.run(_save_edge_audio(text, voice, edge_rate, path))
        except Exception as exc:
            print(f"Edge TTS failed; falling back to macOS say: {exc}")
            return False
    _play(path)
    return True


def _build_audio_file(
    text: str,
    backend: str,
    voice: str,
    fallback_voice: str,
    rate: int,
) -> tuple[Path | None, str, str | int, bool, str]:
    if backend == "edge":
        edge_rate = _edge_rate(rate)
        path = _audio_cache_path("edge", voice, edge_rate, text, "mp3")
        if path.exists():
            return path, "edge", edge_rate, True, voice
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            asyncio.run(_save_edge_audio(text, voice, edge_rate, path))
        except Exception as exc:
            print(f"warn Edge TTS failed for cached audio; falling back to macOS say: {exc}")
        else:
            return path, "edge", edge_rate, False, voice

    if backend == "azure":
        print("warn Azure TTS backend is not configured in this CLI yet; falling back to macOS say.")

    say_path = _audio_cache_path("say", fallback_voice, rate, text, "aiff")
    if say_path.exists():
        return say_path, "say", rate, True, fallback_voice
    if _save_say_audio(text, fallback_voice, rate, say_path):
        return say_path, "say", rate, False, fallback_voice
    return None, "say", rate, False, fallback_voice


def _azure(text: str, voice: str, rate: int) -> bool:
    print("Azure TTS backend is not configured in this CLI yet; falling back to macOS say.")
    return False


def _speak_answer(text: str, backend: str, voice: str, fallback_voice: str, rate: int) -> None:
    if backend == "edge" and _edge(text, voice=voice, rate=rate):
        return
    if backend == "azure" and _azure(text, voice=voice, rate=rate):
        return
    _say(text, voice=fallback_voice if backend != "say" else voice, rate=rate)


def build_audio(
    latest: bool = False,
    lesson_id: str | None = None,
    limit: int = 0,
    mode: str = "review",
    tts_backend: str = "edge",
    english_voice: str = DEFAULT_ENGLISH_VOICE,
    mandarin_voice: str = DEFAULT_MANDARIN_VOICE,
    edge_english_voice: str = DEFAULT_EDGE_ENGLISH_VOICE,
    edge_voice: str = DEFAULT_EDGE_MANDARIN_VOICE,
    azure_voice: str = DEFAULT_AZURE_MANDARIN_VOICE,
    english_rate: int = 170,
    mandarin_rate: int = 150,
    seed: int | None = None,
    voice_variety: bool = True,
) -> AudioBuildStats:
    ensure_project_dirs()
    if tts_backend not in TTS_BACKENDS:
        raise ValueError(f"Unknown TTS backend: {tts_backend}")

    lessons, errors = validate_lessons(latest=latest, lesson_id=lesson_id)
    if errors:
        print("Lesson validation failed:")
        for error in errors:
            print(f"  {error}")
        return AudioBuildStats(failed=len(errors))
    if not lessons:
        print(f"No structured lessons found in {STRUCTURED_DIR}.")
        return AudioBuildStats()

    state = _load_state()
    cards = [card for lesson in lessons for card in lesson.cards]
    cards = _select_cards(cards, state, mode=mode, limit=limit, seed=seed)
    if not cards:
        print("No cards matched this audio build mode.")
        return AudioBuildStats()

    stats = AudioBuildStats()
    available_mandarin_voices = _available_say_voices()
    print(f"Building audio for {len(cards)} card(s).")
    print(f"Requested backend: {tts_backend}")

    for index, card in enumerate(cards, start=1):
        answer_voice, _, rate_offset = _voice_for_card(
            index,
            fallback_voice={"edge": edge_voice, "azure": azure_voice}.get(tts_backend, mandarin_voice),
            voice_variety=voice_variety,
            available_voices=available_mandarin_voices,
            backend=tts_backend,
        )
        answer_rate = max(mandarin_rate + rate_offset, 80)
        clips = [
            ("prompt", card.prompt_en, edge_english_voice if tts_backend == "edge" else english_voice, english_voice, english_rate),
            ("answer", card.answer_zh, answer_voice, mandarin_voice, answer_rate),
        ]

        for role, text, voice, fallback_voice, rate in clips:
            path, actual_backend, actual_rate, reused, actual_voice = _build_audio_file(
                text=text,
                backend=tts_backend,
                voice=voice,
                fallback_voice=fallback_voice,
                rate=rate,
            )
            if path is None:
                stats.failed += 1
                print(f"fail {card.lesson_id} {card.id} {role}")
                continue

            if reused:
                stats.reused += 1
            else:
                stats.generated += 1
            if actual_backend != tts_backend:
                stats.fallback_used += 1

            metadata = _audio_metadata(
                card=card,
                role=role,
                text=text,
                requested_backend=tts_backend,
                actual_backend=actual_backend,
                voice=actual_voice,
                rate=actual_rate,
                audio_path=path,
            )
            _write_audio_metadata(_metadata_path(path), metadata)
            stats.metadata_written += 1

    print(
        "Audio build: "
        f"generated={stats.generated} "
        f"reused={stats.reused} "
        f"failed={stats.failed} "
        f"metadata={stats.metadata_written} "
        f"fallback={stats.fallback_used}"
    )
    return stats


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
    voice_variety: bool = True,
    tts_backend: str = "say",
    edge_voice: str = DEFAULT_EDGE_MANDARIN_VOICE,
    azure_voice: str = DEFAULT_AZURE_MANDARIN_VOICE,
) -> None:
    ensure_project_dirs()
    if tts_backend not in TTS_BACKENDS:
        raise ValueError(f"Unknown TTS backend: {tts_backend}")
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
    available_mandarin_voices = _available_say_voices()
    print(f"Saving responses to {session_dir}")
    print("Grant microphone access if macOS asks. Use q at the rating prompt to stop.")
    print(f"TTS backend: {tts_backend}")
    if voice_variety:
        count = len(available_mandarin_voices)
        if tts_backend == "say":
            print(f"Voice variety: rotating {count or 1} Mandarin voice source(s) with profile-specific rates.")
        else:
            print("Voice variety: rotating Mandarin neural voice profiles with profile-specific rates.")

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
            print(card.display_pinyin)
        if card.notes:
            print(card.notes)
        answer_voice, voice_label, rate_offset = _voice_for_card(
            index,
            fallback_voice={"edge": edge_voice, "azure": azure_voice}.get(tts_backend, mandarin_voice),
            voice_variety=voice_variety,
            available_voices=available_mandarin_voices,
            backend=tts_backend,
        )
        print(f"Voice: {voice_label} ({answer_voice})")
        answer_rate = max(mandarin_rate + rate_offset, 80)
        _speak_answer(
            card.answer_zh,
            backend=tts_backend,
            voice=answer_voice,
            fallback_voice=mandarin_voice,
            rate=answer_rate,
        )

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
