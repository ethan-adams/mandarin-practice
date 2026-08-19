from __future__ import annotations

import hashlib
import json
import re
import shutil
from datetime import datetime
from pathlib import Path

from mandarin_practice.paths import RAW_DIR, ensure_project_dirs


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _metadata_path() -> Path:
    return RAW_DIR / "manifest.json"


def _load_manifest() -> dict:
    path = _metadata_path()
    if not path.exists():
        return {"lessons": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _save_manifest(manifest: dict) -> None:
    _metadata_path().write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _parse_date(year: str, month: str, day: str) -> datetime | None:
    try:
        return datetime(int(year), int(month), int(day))
    except ValueError:
        return None


def _infer_lesson_date(filename: str) -> datetime | None:
    stem = Path(filename).stem

    ethan_match = re.search(r"\bEthan_(\d{2})(\d{2})(\d{2})\b", stem, re.IGNORECASE)
    if ethan_match:
        year, month, day = ethan_match.groups()
        return _parse_date(f"20{year}", month, day)

    iso_match = re.search(r"\b(20\d{2})[-_. ]?([01]\d)[-_. ]?([0-3]\d)\b", stem)
    if iso_match:
        return _parse_date(*iso_match.groups())

    us_match = re.search(r"\b([01]?\d)[-_. ]([0-3]?\d)[-_. ](20\d{2})\b", stem)
    if us_match:
        month, day, year = us_match.groups()
        return _parse_date(year, month, day)

    month_names = {
        "jan": 1,
        "january": 1,
        "feb": 2,
        "february": 2,
        "mar": 3,
        "march": 3,
        "apr": 4,
        "april": 4,
        "may": 5,
        "jun": 6,
        "june": 6,
        "jul": 7,
        "july": 7,
        "aug": 8,
        "august": 8,
        "sep": 9,
        "sept": 9,
        "september": 9,
        "oct": 10,
        "october": 10,
        "nov": 11,
        "november": 11,
        "dec": 12,
        "december": 12,
    }
    month_pattern = "|".join(month_names)
    named_match = re.search(
        rf"\b({month_pattern})[-_. ]+([0-3]?\d)(?:st|nd|rd|th)?[-_,. ]+(20\d{{2}})\b",
        stem,
        re.IGNORECASE,
    )
    if named_match:
        month_name, day, year = named_match.groups()
        return _parse_date(year, str(month_names[month_name.lower()]), day)

    return None


def normalize_preply_filename(filename: str) -> str:
    lesson_date = _infer_lesson_date(filename)
    if lesson_date is None:
        return Path(filename).name
    return f"Ethan_{lesson_date:%y%m%d}.pdf"


def _lesson_date_for_manifest(filename: str) -> str | None:
    lesson_date = _infer_lesson_date(filename)
    if lesson_date is None:
        return None
    return lesson_date.date().isoformat()


def _known_lesson_dates(manifest: dict) -> set[str]:
    dates = set()
    for item in manifest["lessons"]:
        lesson_date = item.get("lesson_date")
        if isinstance(lesson_date, str):
            dates.add(lesson_date)
            continue
        inferred = _lesson_date_for_manifest(item.get("filename", ""))
        if inferred:
            dates.add(inferred)
    return dates


def ingest_lessons(
    source: Path,
    pattern: str,
    *,
    dry_run: bool = False,
    normalize_preply: bool = False,
) -> None:
    ensure_project_dirs()
    if not source.exists():
        raise SystemExit(f"Source folder does not exist: {source}")

    manifest = _load_manifest()
    known_hashes = {item["sha256"] for item in manifest["lessons"]}
    known_dates = _known_lesson_dates(manifest)
    imported = 0
    duplicates = 0

    for pdf in sorted(source.glob(pattern)):
        if not pdf.is_file():
            continue
        digest = _sha256(pdf)
        if digest in known_hashes:
            duplicates += 1
            print(f"dup  {pdf.name}")
            continue

        target_name = normalize_preply_filename(pdf.name) if normalize_preply else pdf.name
        lesson_date = _lesson_date_for_manifest(target_name)
        if normalize_preply and lesson_date in known_dates:
            duplicates += 1
            print(f"dup  {pdf.name}: lesson date {lesson_date} already imported")
            continue

        target = RAW_DIR / target_name
        if target.exists():
            if normalize_preply:
                duplicates += 1
                print(f"dup  {pdf.name}: target {target.name} already exists")
                continue
            target = RAW_DIR / f"{pdf.stem}-{digest[:8]}{pdf.suffix}"

        action = "would import" if dry_run else "ok  "
        print(f"{action} {pdf.name} -> {target.name}")
        if dry_run:
            known_hashes.add(digest)
            if lesson_date:
                known_dates.add(lesson_date)
            imported += 1
            continue

        shutil.copy2(pdf, target)

        manifest["lessons"].append(
            {
                "filename": target.name,
                "source": str(pdf),
                "original_filename": pdf.name,
                "sha256": digest,
                "size_bytes": target.stat().st_size,
                "imported_at": datetime.now().isoformat(timespec="seconds"),
                "lesson_date": lesson_date,
            }
        )
        known_hashes.add(digest)
        if lesson_date:
            known_dates.add(lesson_date)
        imported += 1

    if not dry_run:
        manifest["lessons"].sort(key=lambda item: item["filename"])
        _save_manifest(manifest)
    print()
    label = "Would import" if dry_run else "Imported"
    print(f"{label}: {imported}; duplicates skipped: {duplicates}")
