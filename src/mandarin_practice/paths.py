from __future__ import annotations

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LESSONS_DIR = PROJECT_ROOT / "lessons"
RAW_DIR = LESSONS_DIR / "raw"
EXTRACTED_DIR = LESSONS_DIR / "extracted"
STRUCTURED_DIR = LESSONS_DIR / "structured"
AUDIO_DIR = LESSONS_DIR / "audio"


def ensure_project_dirs() -> None:
    for path in [RAW_DIR, EXTRACTED_DIR, STRUCTURED_DIR, AUDIO_DIR]:
        path.mkdir(parents=True, exist_ok=True)

