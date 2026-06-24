# Plan

## Goal

Create a low-friction practice system that turns weekly Mandarin tutor PDFs into Paul Noble-style call/response drills:

1. Hear or read an English prompt.
2. Attempt the Mandarin answer.
3. Reveal and hear the Mandarin answer.
4. Mark whether it was correct.
5. Repeat weak material more often over time.

## Principles

- Keep tutor PDFs and generated lesson content local by default.
- Make the weekly workflow one command once the pipeline is stable.
- Prefer editable intermediate files so bad OCR or bad LLM output can be fixed quickly.
- Build the CLI first, then add a local web UI after the workflow proves itself.

## Local Data Layout

```text
lessons/
  raw/          copied PDFs, ignored by git
  extracted/    extracted or OCR text, ignored by git
  structured/   practice-card JSON, ignored by git
  audio/        generated practice sessions, ignored by git
```

## Tooling

Required soon:

```bash
brew install poppler tesseract tesseract-lang ffmpeg
```

- `poppler`: reliable PDF text extraction.
- `tesseract`: OCR when lesson PDFs are scanned/image-only.
- `tesseract-lang`: Chinese OCR language data.
- `ffmpeg`: combine prompt, silence, and answer clips into MP3 practice sessions.
- macOS `say`: local Mandarin text-to-speech for interactive practice.

Optional:

- OpenAI API key for converting extracted text into clean card JSON.
- A browser-based UI after CLI practice feels right.

## Milestones

### 1. Foundation

- Private GitHub repo.
- Python CLI installed with `uv`.
- `doctor`, `ingest`, `extract`, and `practice` commands.
- Local lesson files ignored by git.

### 2. Extraction

- Use `pdftotext` for text-based PDFs.
- Add OCR fallback with `tesseract` for scanned PDFs.
- Add extraction quality checks so bad text is flagged.

### 3. Card Generation

- Generate draft cards from extracted lesson text.
- Keep output as editable JSON.
- Include English prompt, Mandarin answer, pinyin, and optional notes.

### 4. Practice Quality

- Add spaced repetition state.
- Support lesson-specific, latest-only, and mixed review sessions.
- Track misses and resurface weak cards.

### 5. Audio Sessions

- Generate call/response tracks:
  - English prompt
  - silence
  - Mandarin answer
  - repeat
- Export MP3s to `lessons/audio/`.

### 6. Local UI

- Add a small local app only after the data model stabilizes.
- Keep the app focused on fast practice, review, and correction.

