from __future__ import annotations

import shutil
import subprocess
from importlib.util import find_spec
from pathlib import Path

from mandarin_practice.audio import DEFAULT_EDGE_MANDARIN_VOICE, DEFAULT_MANDARIN_VOICE
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


def _tesseract_languages() -> set[str]:
    try:
        result = subprocess.run(
            ["tesseract", "--list-langs"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError:
        return set()
    return {line.strip() for line in result.stdout.splitlines()[1:] if line.strip()}


def _say_voices() -> set[str]:
    try:
        result = subprocess.run(
            ["say", "-v", "?"],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
    except OSError:
        return set()
    return {line.split()[0] for line in result.stdout.splitlines() if line.strip()}


def run_doctor(project_root: Path) -> None:
    ensure_project_dirs()
    print(f"Project: {project_root}")
    print()
    print("Folders:")
    for folder in [
        "lessons/raw",
        "lessons/extracted",
        "lessons/structured",
        "lessons/audio",
        "lessons/audio/cache",
        "lessons/audio/sessions",
        "lessons/state",
    ]:
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

    if shutil.which("tesseract"):
        languages = _tesseract_languages()
        print()
        print("OCR languages:")
        for language in ["eng", "chi_sim"]:
            print(f"  ok  {language}" if language in languages else f"  miss {language}")

    if shutil.which("say"):
        voices = _say_voices()
        print()
        print("Speech voices:")
        default_voice = DEFAULT_MANDARIN_VOICE.split()[0]
        print(f"  ok  {DEFAULT_MANDARIN_VOICE}" if default_voice in voices else f"  miss {DEFAULT_MANDARIN_VOICE}")
        chinese_voices = sorted(voice for voice in voices if voice in {"Sandy", "Tingting", "Mei-Jia", "Sinji", "Yue"})
        if chinese_voices:
            print(f"  ok  Chinese macOS voices: {', '.join(chinese_voices)}")
        else:
            print("  info Install enhanced Chinese voices in System Settings -> Accessibility -> Read & Speak.")

    print()
    print("Optional TTS backends:")
    print(f"  ok  edge-tts ({DEFAULT_EDGE_MANDARIN_VOICE})" if find_spec("edge_tts") else "  miss edge-tts: uv sync --extra edge")
    print("  info Azure Speech requires Azure setup and keys; this CLI currently falls back to say.")
