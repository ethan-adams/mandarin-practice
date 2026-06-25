from __future__ import annotations

import argparse
from pathlib import Path

from mandarin_practice.audio import (
    DEFAULT_AZURE_MANDARIN_VOICE,
    DEFAULT_EDGE_ENGLISH_VOICE,
    DEFAULT_EDGE_MANDARIN_VOICE,
    DEFAULT_ENGLISH_VOICE,
    DEFAULT_MANDARIN_VOICE,
    TTS_BACKENDS,
    build_audio,
    speak_practice,
)
from mandarin_practice.cards import validate_lessons
from mandarin_practice.doctor import run_doctor
from mandarin_practice.expand import DEFAULT_OUTPUT, expand_practice
from mandarin_practice.extract import extract_lessons
from mandarin_practice.ingest import ingest_lessons
from mandarin_practice.paths import PROJECT_ROOT
from mandarin_practice.practice import practice, stats
from mandarin_practice.session import DEFAULT_RESPONSE_GAP_SECONDS, DEFAULT_SESSION_ID, build_session


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="mandarin",
        description="Turn tutor PDFs into Mandarin call/response practice.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("doctor", help="Check local tools and project folders.")
    subparsers.add_parser("stats", help="Show review progress and due-card counts.")

    audio_parser = subparsers.add_parser("audio", help="Build and inspect generated practice audio.")
    audio_subparsers = audio_parser.add_subparsers(dest="audio_command", required=True)
    audio_build_parser = audio_subparsers.add_parser("build", help="Prebuild prompt and answer audio.")
    audio_build_parser.add_argument("--latest", action="store_true", help="Build audio for only the newest structured lesson.")
    audio_build_parser.add_argument("--lesson", help="Build audio for a specific lesson id, such as Ethan_260624.")
    audio_build_parser.add_argument("--limit", type=int, default=0, help="Maximum cards. Defaults to all selected cards.")
    audio_build_parser.add_argument(
        "--mode",
        choices=["all", "review", "new"],
        default="review",
        help="Build audio for all cards, due review cards, or never-attempted cards.",
    )
    audio_build_parser.add_argument("--tts-backend", choices=TTS_BACKENDS, default="edge", help="Audio backend. Defaults to edge.")
    audio_build_parser.add_argument("--english-voice", default=DEFAULT_ENGLISH_VOICE, help="macOS voice for prompt fallback audio.")
    audio_build_parser.add_argument("--mandarin-voice", default=DEFAULT_MANDARIN_VOICE, help="macOS voice for answer fallback audio.")
    audio_build_parser.add_argument("--edge-english-voice", default=DEFAULT_EDGE_ENGLISH_VOICE, help="Edge neural voice for prompts.")
    audio_build_parser.add_argument("--edge-voice", default=DEFAULT_EDGE_MANDARIN_VOICE, help="Edge neural voice for Mandarin answers.")
    audio_build_parser.add_argument("--azure-voice", default=DEFAULT_AZURE_MANDARIN_VOICE, help="Azure neural voice for Mandarin answers.")
    audio_build_parser.add_argument("--english-rate", type=int, default=170, help="Prompt speech rate.")
    audio_build_parser.add_argument("--mandarin-rate", type=int, default=150, help="Answer speech rate.")
    audio_build_parser.add_argument("--single-voice", action="store_true", help="Use only --edge-voice or --mandarin-voice for answers.")
    audio_build_parser.add_argument("--seed", type=int, help="Shuffle selected cards with a deterministic seed.")

    session_parser = subparsers.add_parser("session", help="Build phone-friendly practice sessions.")
    session_subparsers = session_parser.add_subparsers(dest="session_command", required=True)
    session_build_parser = session_subparsers.add_parser("build", help="Build a session manifest and required audio.")
    session_build_parser.add_argument("--latest", action="store_true", help="Build a session for only the newest structured lesson.")
    session_build_parser.add_argument("--lesson", help="Build a session for a specific lesson id, such as Ethan_260624.")
    session_build_parser.add_argument("--limit", type=int, default=10, help="Maximum cards. Defaults to 10.")
    session_build_parser.add_argument(
        "--mode",
        choices=["all", "review", "new"],
        default="review",
        help="Build a session from all cards, due review cards, or never-attempted cards.",
    )
    session_build_parser.add_argument("--session-id", default=DEFAULT_SESSION_ID, help="Folder name under lessons/audio/sessions/.")
    session_build_parser.add_argument(
        "--response-gap",
        type=int,
        default=DEFAULT_RESPONSE_GAP_SECONDS,
        help="Seconds between prompt and answer playback.",
    )
    session_build_parser.add_argument("--tts-backend", choices=TTS_BACKENDS, default="edge", help="Audio backend. Defaults to edge.")
    session_build_parser.add_argument("--english-voice", default=DEFAULT_ENGLISH_VOICE, help="macOS voice for prompt fallback audio.")
    session_build_parser.add_argument("--mandarin-voice", default=DEFAULT_MANDARIN_VOICE, help="macOS voice for answer fallback audio.")
    session_build_parser.add_argument("--edge-english-voice", default=DEFAULT_EDGE_ENGLISH_VOICE, help="Edge neural voice for prompts.")
    session_build_parser.add_argument("--edge-voice", default=DEFAULT_EDGE_MANDARIN_VOICE, help="Edge neural voice for Mandarin answers.")
    session_build_parser.add_argument("--english-rate", type=int, default=170, help="Prompt speech rate.")
    session_build_parser.add_argument("--mandarin-rate", type=int, default=150, help="Answer speech rate.")
    session_build_parser.add_argument("--single-voice", action="store_true", help="Use only --edge-voice or --mandarin-voice for answers.")
    session_build_parser.add_argument("--seed", type=int, help="Shuffle selected cards with a deterministic seed.")

    validate_parser = subparsers.add_parser("validate", help="Validate structured lesson JSON.")
    validate_parser.add_argument("--latest", action="store_true", help="Validate only the newest tutor lesson.")
    validate_parser.add_argument("--lesson", help="Validate a specific lesson id, such as Ethan_260620.")

    today_parser = subparsers.add_parser("today", help="Practice due cards for today.")
    today_parser.add_argument("--limit", type=int, default=25, help="Maximum cards. Defaults to 25.")
    today_parser.add_argument("--no-audio", action="store_true", help="Do not speak Mandarin answers aloud.")
    today_parser.add_argument("--seed", type=int, help="Shuffle due cards with a deterministic seed.")

    speak_parser = subparsers.add_parser("speak", help="Run spoken call/response practice.")
    speak_parser.add_argument("--latest", action="store_true", help="Practice only the newest structured lesson.")
    speak_parser.add_argument("--lesson", help="Practice a specific lesson id, such as Ethan_260620.")
    speak_parser.add_argument("--limit", type=int, default=10, help="Maximum cards. Defaults to 10.")
    speak_parser.add_argument(
        "--mode",
        choices=["all", "review", "new"],
        default="review",
        help="Practice all cards, only due review cards, or only never-attempted cards.",
    )
    speak_parser.add_argument("--seconds", type=int, default=5, help="Seconds to record each response.")
    speak_parser.add_argument("--english-voice", default=DEFAULT_ENGLISH_VOICE, help="macOS voice for prompts.")
    speak_parser.add_argument("--mandarin-voice", default=DEFAULT_MANDARIN_VOICE, help="macOS voice for answers.")
    speak_parser.add_argument("--tts-backend", choices=TTS_BACKENDS, default="say", help="Answer TTS backend. Defaults to say.")
    speak_parser.add_argument("--edge-voice", default=DEFAULT_EDGE_MANDARIN_VOICE, help="Edge neural voice for answers.")
    speak_parser.add_argument("--azure-voice", default=DEFAULT_AZURE_MANDARIN_VOICE, help="Azure neural voice for answers.")
    speak_parser.add_argument("--english-rate", type=int, default=170, help="Prompt speech rate.")
    speak_parser.add_argument("--mandarin-rate", type=int, default=150, help="Answer speech rate.")
    speak_parser.add_argument("--input-device", default="0", help="ffmpeg avfoundation audio device index. Defaults to 0.")
    speak_parser.add_argument("--no-replay", action="store_true", help="Do not replay your recorded response.")
    speak_parser.add_argument("--single-voice", action="store_true", help="Use only --mandarin-voice instead of rotating voice profiles.")
    speak_parser.add_argument("--seed", type=int, help="Shuffle cards with a deterministic seed.")

    ingest_parser = subparsers.add_parser("ingest", help="Import Ethan_*.pdf lesson files.")
    ingest_parser.add_argument(
        "--source",
        default=str(Path.home() / "Downloads"),
        help="Folder to scan for lesson PDFs. Defaults to ~/Downloads.",
    )
    ingest_parser.add_argument(
        "--pattern",
        default="Ethan_*.pdf",
        help="Glob pattern for lesson PDFs. Defaults to Ethan_*.pdf.",
    )
    ingest_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show imports without copying files or updating the manifest.",
    )
    ingest_parser.add_argument(
        "--normalize-preply",
        action="store_true",
        help="Infer lesson dates from Preply-style filenames and copy as Ethan_YYMMDD.pdf.",
    )

    preply_parser = subparsers.add_parser(
        "import-preply",
        help="Import Preply lesson PDFs with filename normalization.",
    )
    preply_parser.add_argument(
        "--source",
        default=str(Path.home() / "Downloads"),
        help="Folder to scan for Preply lesson PDFs. Defaults to ~/Downloads.",
    )
    preply_parser.add_argument(
        "--pattern",
        default="*.pdf",
        help="Glob pattern for Preply PDFs. Defaults to *.pdf.",
    )
    preply_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show imports without copying files or updating the manifest.",
    )

    extract_parser = subparsers.add_parser("extract", help="Extract text from imported PDFs.")
    extract_parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite existing extracted text files.",
    )

    expand_parser = subparsers.add_parser(
        "expand",
        help="Generate extra practice from known lesson patterns.",
    )
    expand_parser.add_argument(
        "--count",
        type=int,
        default=120,
        help="Number of generated cards. Use 0 for all available generated cards.",
    )
    expand_parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"Output JSON filename under lessons/structured/. Defaults to {DEFAULT_OUTPUT}.",
    )
    expand_parser.add_argument(
        "--seed",
        type=int,
        default=260620,
        help="Random seed for deterministic card ordering.",
    )

    practice_parser = subparsers.add_parser("practice", help="Run call/response drills.")
    practice_parser.add_argument(
        "--latest",
        action="store_true",
        help="Practice only the newest structured lesson.",
    )
    practice_parser.add_argument(
        "--lesson",
        help="Practice a specific lesson id, such as Ethan_260620.",
    )
    practice_parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Maximum cards to practice. Defaults to all.",
    )
    practice_parser.add_argument(
        "--mode",
        choices=["all", "review", "new"],
        default="all",
        help="Practice all cards, only due review cards, or only never-attempted cards.",
    )
    practice_parser.add_argument(
        "--no-audio",
        action="store_true",
        help="Do not speak Mandarin answers aloud.",
    )
    practice_parser.add_argument(
        "--seed",
        type=int,
        help="Shuffle cards with a deterministic seed.",
    )

    args = parser.parse_args()

    if args.command == "doctor":
        run_doctor(PROJECT_ROOT)
    elif args.command == "stats":
        stats()
    elif args.command == "audio":
        if args.audio_command == "build":
            build_audio(
                latest=args.latest,
                lesson_id=args.lesson,
                limit=args.limit,
                mode=args.mode,
                tts_backend=args.tts_backend,
                english_voice=args.english_voice,
                mandarin_voice=args.mandarin_voice,
                edge_english_voice=args.edge_english_voice,
                edge_voice=args.edge_voice,
                azure_voice=args.azure_voice,
                english_rate=args.english_rate,
                mandarin_rate=args.mandarin_rate,
                seed=args.seed,
                voice_variety=not args.single_voice,
            )
    elif args.command == "session":
        if args.session_command == "build":
            build_session(
                latest=args.latest,
                lesson_id=args.lesson,
                limit=args.limit,
                mode=args.mode,
                session_id=args.session_id,
                response_gap_seconds=args.response_gap,
                tts_backend=args.tts_backend,
                english_voice=args.english_voice,
                mandarin_voice=args.mandarin_voice,
                edge_english_voice=args.edge_english_voice,
                edge_voice=args.edge_voice,
                english_rate=args.english_rate,
                mandarin_rate=args.mandarin_rate,
                seed=args.seed,
                voice_variety=not args.single_voice,
            )
    elif args.command == "validate":
        lessons, errors = validate_lessons(latest=args.latest, lesson_id=args.lesson)
        for lesson in lessons:
            print(f"ok   {lesson.path.name}: {len(lesson.cards)} cards")
        if errors:
            for error in errors:
                print(f"fail {error}")
            raise SystemExit(1)
        print(f"Validated {len(lessons)} lesson file(s).")
    elif args.command == "today":
        practice(limit=args.limit, mode="review", audio=not args.no_audio, seed=args.seed)
    elif args.command == "speak":
        speak_practice(
            latest=args.latest,
            lesson_id=args.lesson,
            limit=args.limit,
            mode=args.mode,
            seconds=args.seconds,
            english_voice=args.english_voice,
            mandarin_voice=args.mandarin_voice,
            english_rate=args.english_rate,
            mandarin_rate=args.mandarin_rate,
            input_device=args.input_device,
            replay=not args.no_replay,
            seed=args.seed,
            voice_variety=not args.single_voice,
            tts_backend=args.tts_backend,
            edge_voice=args.edge_voice,
            azure_voice=args.azure_voice,
        )
    elif args.command == "ingest":
        ingest_lessons(
            Path(args.source).expanduser(),
            args.pattern,
            dry_run=args.dry_run,
            normalize_preply=args.normalize_preply,
        )
    elif args.command == "import-preply":
        ingest_lessons(
            Path(args.source).expanduser(),
            args.pattern,
            dry_run=args.dry_run,
            normalize_preply=True,
        )
    elif args.command == "extract":
        extract_lessons(force=args.force)
    elif args.command == "expand":
        expand_practice(count=args.count, output=args.output, seed=args.seed)
    elif args.command == "practice":
        practice(
            latest=args.latest,
            lesson_id=args.lesson,
            limit=args.limit,
            mode=args.mode,
            audio=not args.no_audio,
            seed=args.seed,
        )


if __name__ == "__main__":
    main()
