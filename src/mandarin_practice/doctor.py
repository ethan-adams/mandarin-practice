from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from mandarin_practice.paths import ensure_project_dirs


TOOLS = {
    "pdfinfo": "PDF metadata from poppler",
    "pdftotext": "PDF text extraction from poppler",
    "pdftoppm": "PDF page rendering for OCR from poppler",
    "tesseract": "OCR for scanned PDFs",
    "ffmpeg": "Audio export assembly",
    "say": "macOS text-to-speech",
}


def _version(command: str) -> str:
    if command == "say":
        return ""
    version_args = {
        "pdfinfo": ["pdfinfo", "-v"],
        "pdftotext": ["pdftotext", "-v"],
        "pdftoppm": ["pdftoppm", "-v"],
    }.get(command, [command, "--version"])
    try:
        result = subprocess.run(
            version_args,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            check=False,
        )
    except OSError:
        return ""
    first_line = result.stdout.splitlines()[0] if result.stdout else ""
    return first_line.strip()


def run_doctor(project_root: Path) -> None:
    ensure_project_dirs()
    print(f"Project: {project_root}")
    print()
    print("Folders:")
    for folder in ["lessons/raw", "lessons/extracted", "lessons/structured", "lessons/audio"]:
        path = project_root / folder
        print(f"  ok  {folder}" if path.exists() else f"  miss {folder}")

    print()
    print("Tools:")
    missing = []
    for command, purpose in TOOLS.items():
        found = shutil.which(command)
        if found:
            version = _version(command)
            suffix = f" - {version}" if version else ""
            print(f"  ok  {command}: {found}{suffix}")
        else:
            missing.append(command)
            print(f"  miss {command}: {purpose}")

    if missing:
        print()
        print("Recommended install:")
        print("  brew install poppler tesseract tesseract-lang ffmpeg")
