# Issue 6: Add Optional Direct Preply PDF Download Sync

## Goal

Let the weekly import workflow pull lesson PDFs from Preply directly, when the user is already logged in locally, while keeping the current manual-download import path as the reliable fallback.

## Context

Current Preply intake starts after a PDF exists in a local folder:

```bash
uv run mandarin import-preply --source ~/Downloads
uv run mandarin extract
```

A first inspection attempt reached Preply's login page at `https://preply.com/en/login?next=/en/home`. The safe stopping point was to avoid handling credentials or OAuth. Future work should reuse a local authenticated browser session and never store Preply passwords in the repo or config.

## Suggested Files To Inspect

- `src/mandarin_practice/ingest.py`
- `src/mandarin_practice/cli.py`
- `src/mandarin_practice/paths.py`
- `tests/test_ingest.py`
- `docs/ROADMAP.md`
- `README.md`

## Implementation Notes

- Add a command such as:

  ```bash
  uv run mandarin preply sync
  ```

- Use a dedicated local browser profile outside the repo, for example:

  ```text
  ~/.local/share/mandarin-practice/preply-browser-profile
  ```

- If the browser is not logged in, open Preply and instruct the user to log in manually.
- Do not accept, collect, store, print, or commit Preply credentials, cookies, session tokens, or downloaded private pages.
- Download only likely lesson PDF/material files into a local staging folder outside git tracking.
- Feed staged PDFs into the existing `import-preply` normalization, hash duplicate detection, and manifest writing path.
- Keep `mandarin import-preply --source ~/Downloads` working unchanged.
- Prefer browser automation over reverse-engineering private Preply APIs unless an official export/API appears.
- Add dry-run behavior that lists candidate PDFs without downloading or importing.

## Acceptance Criteria

- A logged-in local browser session can be reused to find and download new Preply PDF lesson materials.
- Logged-out state fails gracefully with clear instructions and no credential handling.
- Downloaded PDFs are deduped through the existing raw manifest logic.
- Existing manual download/import flow remains the fallback and keeps passing tests.
- Tests cover command argument handling and the import handoff; browser-specific behavior can be isolated behind a small adapter and documented for manual verification.

## Verification

```bash
make test
uv run mandarin validate
uv run mandarin doctor
uv run mandarin import-preply --source ~/Downloads --dry-run
```

Manual verification should use a logged-in Preply browser profile and confirm that no credentials or cookies are written under the project directory.
