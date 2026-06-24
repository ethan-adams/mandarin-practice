from __future__ import annotations

import argparse
from pathlib import Path

from mandarin_practice.doctor import run_doctor
from mandarin_practice.extract import extract_lessons
from mandarin_practice.ingest import ingest_lessons
from mandarin_practice.paths import PROJECT_ROOT
from mandarin_practice.practice import practice


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="mandarin",
        description="Turn tutor PDFs into Mandarin call/response practice.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("doctor", help="Check local tools and project folders.")

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

    args = parser.parse_args()

    if args.command == "doctor":
        run_doctor(PROJECT_ROOT)
    elif args.command == "ingest":
        ingest_lessons(Path(args.source).expanduser(), args.pattern)
    elif args.command == "extract":
        extract_lessons(force=args.force)
    elif args.command == "practice":
        practice(latest=args.latest, lesson_id=args.lesson, limit=args.limit)


if __name__ == "__main__":
    main()

