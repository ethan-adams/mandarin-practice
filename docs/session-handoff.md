# Session Handoff

## Current Branch

`chore/2-preply-import`

This branch contains the local stack for completed issues 3, 1, 2, and 4.
It is ahead of `main` and should be pushed as an integration branch or merged
locally after review.

## Completed

- Issue 3: high-quality audio build pipeline.
- Issue 1: phone-friendly session manifest and static website player.
- Issue 2: Preply PDF import with dry-run, filename normalization, and duplicate detection.
- Issue 4: speed presets across audio build, session build, spoken practice, and the website.

## Current Capabilities

- `uv run mandarin audio build --latest --limit 10`
- `uv run mandarin audio build --latest --limit 10 --speed slow`
- `uv run mandarin session build --latest --limit 10`
- `uv run mandarin session build --latest --limit 10 --speed slow`
- `uv run mandarin session build --latest --limit 10 --mandarin-rate 130`
- `uv run mandarin import-preply --source ~/Downloads --dry-run`

Session manifests include normal and slow Mandarin answer audio variants. The
website switches between available variants and still opens cleanly when no
local session manifest exists, which keeps static deployment behavior intact.

## Verification Baseline

Run before merging or pushing:

```bash
make test
uv run mandarin validate
uv run mandarin doctor
make website
```

## Next Recommended Task

Issue 5: add advisory browser pronunciation recognition while keeping manual
self-rating available.
