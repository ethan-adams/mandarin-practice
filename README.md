# Mandarin Lesson Practice

Local tools for turning tutor lesson PDFs named `Ethan_YYMMDD.pdf` into call/response Mandarin practice.

The repo intentionally does not commit lesson PDFs, extracted text, generated cards, or audio. Those files stay local under `lessons/`.

## Current Workflow

```bash
uv run mandarin doctor
uv run mandarin ingest --source ~/Downloads
uv run mandarin extract
uv run mandarin practice --latest
```

## System Shape

1. `ingest` copies new `Ethan_*.pdf` files into `lessons/raw/` and records metadata.
2. `extract` turns PDFs into text under `lessons/extracted/`.
3. Lesson text is reviewed or transformed into structured cards under `lessons/structured/`.
4. `practice` runs a Paul Noble-style call/response loop from those cards.
5. Later, `audio` can export prompt/silence/answer practice tracks.

## Recommended Local Tools

```bash
brew install poppler tesseract tesseract-lang ffmpeg
```

- `poppler`: PDF metadata and text extraction (`pdfinfo`, `pdftotext`)
- `tesseract` + `tesseract-lang`: OCR for scanned/image-only lesson PDFs
- `ffmpeg`: later MP3/audio assembly
- macOS `say`: local text-to-speech; already available on macOS

## Card Format

Structured lesson files live at `lessons/structured/Ethan_YYMMDD.json`:

```json
{
  "lesson_id": "Ethan_260620",
  "date": "2026-06-20",
  "cards": [
    {
      "prompt_en": "How would you say: I want to go tomorrow?",
      "answer_zh": "我明天想去。",
      "pinyin": "wo3 ming2 tian1 xiang3 qu4.",
      "notes": "Optional grammar or usage note."
    }
  ]
}
```

## Near-Term Milestones

- Add LLM-assisted conversion from extracted lesson text to cards.
- Add spaced repetition scheduling.
- Add audio session export with English prompt, silence, Mandarin answer, repeat.
- Add a small local web UI after the CLI loop feels right.

