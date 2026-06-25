# Issue 2: Add Auto Import For Preply Lesson PDFs

## Goal

Make weekly Preply lesson PDF import reliable enough that new PDFs land in `lessons/raw/` with minimal manual work.

## Context

The current `mandarin ingest` command scans a source folder for `Ethan_*.pdf`. Preply downloads may need filename normalization, duplicate detection, and better metadata.

## Suggested Files To Inspect

- `src/mandarin_practice/ingest.py`
- `src/mandarin_practice/cli.py`
- `src/mandarin_practice/paths.py`
- `lessons/raw/manifest.json`
- `tests/test_ingest.py`
- `README.md`

## Implementation Notes

- Add `mandarin import-preply` or extend `mandarin ingest` with Preply-specific options.
- Support a configured source directory and a dry-run mode.
- Normalize likely Preply filenames into `Ethan_YYMMDD.pdf` when a date can be inferred.
- Preserve the original filename in `manifest.json`.
- Keep duplicate detection by hash and add duplicate warnings for same inferred lesson date.
- Avoid browser automation or mailbox access in the first slice unless explicitly requested.

## Acceptance Criteria

- A dry run reports which PDFs would be imported and how they would be named.
- Real import copies new files into `lessons/raw/` and updates `manifest.json`.
- Duplicate files are skipped without overwriting existing lesson PDFs.
- Existing `mandarin ingest --source ~/Downloads` behavior keeps working.
- Tests cover filename normalization, dry-run behavior, and duplicate handling.

## Verification

```bash
make test
uv run mandarin doctor
```
