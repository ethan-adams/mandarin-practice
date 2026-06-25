from __future__ import annotations

import os
from pathlib import Path


def _discover_project_root() -> Path:
    configured = os.environ.get("MANDARIN_PRACTICE_HOME")
    if configured:
        return Path(configured).expanduser().resolve()

    cwd = Path.cwd().resolve()
    for candidate in [cwd, *cwd.parents]:
        if (candidate / "lessons").exists():
            return candidate

    return Path(__file__).resolve().parents[2]


PROJECT_ROOT = _discover_project_root()
LESSONS_DIR = PROJECT_ROOT / "lessons"
RAW_DIR = LESSONS_DIR / "raw"
EXTRACTED_DIR = LESSONS_DIR / "extracted"
STRUCTURED_DIR = LESSONS_DIR / "structured"
AUDIO_DIR = LESSONS_DIR / "audio"
AUDIO_CACHE_DIR = AUDIO_DIR / "cache"
STATE_DIR = LESSONS_DIR / "state"


def ensure_project_dirs() -> None:
    for path in [RAW_DIR, EXTRACTED_DIR, STRUCTURED_DIR, AUDIO_DIR, AUDIO_CACHE_DIR, STATE_DIR]:
        path.mkdir(parents=True, exist_ok=True)
