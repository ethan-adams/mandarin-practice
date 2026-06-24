from __future__ import annotations

import hashlib
import json
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


def ingest_lessons(source: Path, pattern: str) -> None:
    ensure_project_dirs()
    if not source.exists():
        raise SystemExit(f"Source folder does not exist: {source}")

    manifest = _load_manifest()
    known_hashes = {item["sha256"] for item in manifest["lessons"]}
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

        target = RAW_DIR / pdf.name
        if target.exists():
            target = RAW_DIR / f"{pdf.stem}-{digest[:8]}{pdf.suffix}"
        shutil.copy2(pdf, target)

        manifest["lessons"].append(
            {
                "filename": target.name,
                "source": str(pdf),
                "sha256": digest,
                "size_bytes": target.stat().st_size,
                "imported_at": datetime.now().isoformat(timespec="seconds"),
            }
        )
        known_hashes.add(digest)
        imported += 1
        print(f"ok   {pdf.name} -> {target.name}")

    manifest["lessons"].sort(key=lambda item: item["filename"])
    _save_manifest(manifest)
    print()
    print(f"Imported: {imported}; duplicates skipped: {duplicates}")

