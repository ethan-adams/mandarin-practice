from __future__ import annotations

import argparse
from pathlib import Path

from mandarin_practice.audio import DEFAULT_ENGLISH_VOICE, DEFAULT_MANDARIN_VOICE, speak_practice
from mandarin_practice.cards import validate_lessons
from mandarin_practice.doctor import run_doctor
from mandarin_practice.expand import DEFAULT_OUTPUT, expand_practice
from mandarin_practice.extract import extract_lessons
from mandarin_practice.ingest import ingest_lessons
from mandarin_practice.paths import PROJECT_ROOT
from mandarin_practice.practice import practice, stats


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="mandarin",
        description="Turn tutor PDFs into Mandarin call/response practice.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("doctor", help="Check local tools and project folders.")
    subparsers.add_parser("stats", help="Show review progress and due-card counts.")

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
    speak_parser.add_argument("--english-rate", type=int, default=170, help="Prompt speech rate.")
    speak_parser.add_argument("--mandarin-rate", type=int, default=150, help="Answer speech rate.")
    speak_parser.add_argument("--input-device", default="0", help="ffmpeg avfoundation audio device index. Defaults to 0.")
    speak_parser.add_argument("--no-replay", action="store_true", help="Do not replay your recorded response.")
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
        )
    elif args.command == "ingest":
        ingest_lessons(Path(args.source).expanduser(), args.pattern)
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
