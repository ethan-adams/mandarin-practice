# Session Handoff

## Current Branch

`feature/3-high-quality-audio-pipeline`

## Completed

- Extracted `Ethan_260624.pdf` into local text.
- Added local structured practice deck `lessons/structured/Ethan_260624.json` with 44 cards.
- Added the agent harness:
  - `AGENTS.md`
  - `docs/agent-workflow.md`
  - `docs/issue-backlog.md`
  - `docs/issues/001-phone-hands-off-practice.md`
  - `docs/issues/002-preply-auto-import.md`
  - `docs/issues/003-high-quality-audio-pipeline.md`
  - `docs/issues/004-speed-adjuster.md`
  - `docs/issues/005-pronunciation-recognition.md`
- Implemented Issue 3:
  - `uv run mandarin audio build`
  - Edge neural TTS default for cached prompt and answer audio.
  - macOS `say` fallback.
  - Stable cache paths.
  - Sidecar metadata files beside cached audio.
  - Tests for metadata and cache behavior.

## Verification Run

```bash
make test
uv run mandarin validate
uv run mandarin doctor
uv run mandarin audio build --lesson Ethan_260624 --limit 1 --mode all --tts-backend say --single-voice
uv run mandarin audio build --lesson Ethan_260624 --limit 1 --mode all --tts-backend edge --single-voice
```

Results:

- `make test`: 16 tests passed.
- `uv run mandarin validate`: 10 lesson files validated.
- `uv run mandarin doctor`: required tools and Edge TTS available.
- `say` audio smoke build: generated 2 clips and 2 metadata files.
- `edge` audio smoke build: generated 2 clips and 2 metadata files.

## Local Data Notes

These files are intentionally ignored by git:

- `lessons/extracted/Ethan_260624.txt`
- `lessons/structured/Ethan_260624.json`
- generated files under `lessons/audio/cache/`

They are present locally and the CLI sees them.

## Next Recommended Task

Start Issue 1:

```text
Start issue 1. Follow AGENTS.md.
```

Issue 1 should consume the audio cache/metadata from Issue 3 and build a phone-friendly session manifest plus web player.

Useful starting command for Issue 1:

```bash
uv run mandarin audio build --latest --limit 5 --mode all --tts-backend edge
```

Expected next implementation direction:

1. Add `lessons/audio/sessions/<session-id>/session.json`.
2. Generate a session manifest from selected cards and cached audio metadata.
3. Upgrade `website/` to load the manifest and play prompt, response gap, answer, repeat, and rating.
4. Keep session result sync simple at first: local export/download is acceptable before direct `review.json` updates.
