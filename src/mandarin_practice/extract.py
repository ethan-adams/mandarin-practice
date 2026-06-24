from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

from mandarin_practice.paths import EXTRACTED_DIR, RAW_DIR, ensure_project_dirs


MIN_USEFUL_TEXT_CHARS = 40
OCR_LANGS = "eng+chi_sim"


def _pdftotext(pdf: Path, target: Path) -> bool:
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf), str(target)],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        print(f"fail {pdf.name}: {result.stderr.strip()}")
        return False
    return True


def _ocr(pdf: Path, target: Path) -> bool:
    if shutil.which("pdftoppm") is None or shutil.which("tesseract") is None:
        print(f"warn {pdf.name}: OCR tools missing; install poppler and tesseract")
        return False

    with tempfile.TemporaryDirectory(prefix="mandarin-ocr-") as tmp:
        prefix = Path(tmp) / pdf.stem
        render = subprocess.run(
            ["pdftoppm", "-r", "300", "-png", str(pdf), str(prefix)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        if render.returncode != 0:
            print(f"fail {pdf.name}: render for OCR failed: {render.stderr.strip()}")
            return False

        pages = sorted(Path(tmp).glob(f"{pdf.stem}-*.png"))
        if not pages:
            print(f"fail {pdf.name}: no rendered pages for OCR")
            return False

        chunks = []
        for page in pages:
            ocr = subprocess.run(
                ["tesseract", str(page), "stdout", "-l", OCR_LANGS],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            if ocr.returncode != 0:
                print(f"fail {pdf.name}: OCR failed on {page.name}: {ocr.stderr.strip()}")
                return False
            chunks.append(ocr.stdout.strip())

        text = "\n\n".join(chunk for chunk in chunks if chunk)
        target.write_text(text + "\n", encoding="utf-8")
        return len(text.strip()) >= MIN_USEFUL_TEXT_CHARS


def extract_lessons(force: bool = False) -> None:
    ensure_project_dirs()
    pdfs = sorted(RAW_DIR.glob("Ethan_*.pdf"))
    if not pdfs:
        print(f"No imported PDFs found in {RAW_DIR}. Run `mandarin ingest` first.")
        return

    if shutil.which("pdftotext") is None:
        print("Missing `pdftotext`. Install poppler with:")
        print("  brew install poppler")
        print()
        print("OCR fallback will be added after poppler/tesseract are installed.")
        return

    for pdf in pdfs:
        target = EXTRACTED_DIR / f"{pdf.stem}.txt"
        if target.exists() and not force:
            print(f"skip {target.name}")
            continue

        if not _pdftotext(pdf, target):
            continue

        text = target.read_text(encoding="utf-8", errors="replace").strip()
        if len(text) < MIN_USEFUL_TEXT_CHARS:
            print(f"ocr  {pdf.name}: extracted very little text; running OCR")
            if _ocr(pdf, target):
                print(f"ok   {pdf.name} -> {target.relative_to(EXTRACTED_DIR.parent)}")
            else:
                print(f"warn {pdf.name}: OCR produced little or no usable text")
        else:
            print(f"ok   {pdf.name} -> {target.relative_to(EXTRACTED_DIR.parent)}")
