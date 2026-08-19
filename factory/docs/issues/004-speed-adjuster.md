# Issue 4: Add Slow/Normal Speed Controls Across Practice Modes

Status: implemented in `chore/2-preply-import`.

## Goal

Let practice sessions use slower Mandarin audio without changing code or regenerating everything manually.

## Context

The CLI already has `--mandarin-rate` and `--english-rate` for `speak`, and the website dashboard has a rate slider. The next step is consistent presets and generated audio variants for phone practice.

## Suggested Files To Inspect

- `src/mandarin_practice/audio.py`
- `src/mandarin_practice/cli.py`
- `website/app.js`
- `website/index.html`
- `website/styles.css`
- `tests/test_audio.py`
- `README.md`

## Implementation Notes

- Add named speed presets: `slow`, `normal`, and optionally `fast`.
- Map presets to backend-specific rates in one shared place.
- For prebuilt audio, generate at least normal and slow Mandarin variants.
- For the website, expose a compact speed control that switches variants when available.
- Preserve direct numeric rate flags for advanced use.
- Document how speed interacts with Edge TTS and macOS `say`.

## Acceptance Criteria

- CLI practice/audio commands accept a speed preset.
- Existing numeric rate options still work.
- Website practice controls can select slow or normal playback.
- Tests cover preset-to-rate mapping.
- README documents common examples.

## Verification

```bash
make test
uv run mandarin validate
make website
```

Verify the website at desktop and phone widths if website controls change.

Implemented command examples:

```bash
uv run mandarin speak --speed slow
uv run mandarin audio build --latest --limit 10 --speed normal
uv run mandarin session build --latest --limit 10 --speed slow
uv run mandarin session build --latest --limit 10 --mandarin-rate 130
```

Current output shape:

- Speed presets are `slow`, `normal`, and `fast`.
- Direct numeric `--english-rate` and `--mandarin-rate` options still override the selected preset.
- Session manifests include `answer_audio_variants` with prebuilt normal and slow Mandarin answer audio.
- The static website can switch between available answer audio variants and still works when no local session has been generated.
