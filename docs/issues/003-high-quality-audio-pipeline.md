# Issue 3: Build High-Quality Audio Generation Pipeline

Status: implemented in `feature/3-high-quality-audio-pipeline`.

## Goal

Make high-quality generated audio a first-class build artifact for practice sessions.

## Context

The current `speak` command can generate Edge answer audio on demand and cache it. Phone practice needs prompt and answer audio generated ahead of time, with metadata that lets agents verify whether audio is missing or stale.

## Suggested Files To Inspect

- `src/mandarin_practice/audio.py`
- `src/mandarin_practice/cli.py`
- `src/mandarin_practice/cards.py`
- `src/mandarin_practice/paths.py`
- `tests/test_audio.py`
- `README.md`
- `docs/ROADMAP.md`

## Implementation Notes

- Add an explicit audio build command such as `uv run mandarin audio build --lesson Ethan_260624 --backend edge`.
- Generate English prompt audio and Mandarin answer audio.
- Use Edge neural TTS as the preferred high-quality backend when the optional extra is installed.
- Keep macOS `say` as a fallback.
- Write metadata for backend, voice, rate, text hash, output path, and generated timestamp.
- Make audio file paths stable and cache-friendly.
- Consider normal and slow Mandarin variants if it does not make the first slice too large.

## Acceptance Criteria

- Audio can be prebuilt for latest, lesson-specific, and review-selected cards.
- The command reports generated, reused, skipped, and failed audio counts.
- Missing optional Edge dependencies produce a clear fallback or setup message.
- Tests cover cache path stability and metadata creation.
- The output is suitable for issue 1 session manifests.

## Verification

```bash
make test
uv run mandarin validate
uv run mandarin doctor
```

If Edge is available, build audio for a small limit and confirm files are created under `lessons/audio/cache/` or a session audio folder.

Implemented command:

```bash
uv run mandarin audio build --latest --limit 1
uv run mandarin audio build --lesson Ethan_260624 --limit 1 --mode all --tts-backend edge
```

Current output shape:

- Audio files are cached under `lessons/audio/cache/`.
- Sidecar metadata is written as `<audio-file>.json`.
- Metadata includes card id, lesson id, role, text hash, requested backend, actual backend, voice, rate, audio path, and generation timestamp.
