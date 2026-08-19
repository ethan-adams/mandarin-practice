# Issue 1: Build Phone Hands-Off Practice Session Player

Status: implemented in `feature/1-phone-session-player`.

## Goal

Create a mobile-friendly practice flow that can run through cards with minimal tapping: English prompt, response gap, Mandarin answer, optional repeat, then rating.

## Context

The current website is a static dashboard and command builder. The CLI can select due cards and speak answers, but it is desktop-first and waits for keyboard input. Phone practice should use a generated session manifest plus prebuilt audio files.

## Suggested Files To Inspect

- `website/index.html`
- `website/app.js`
- `website/styles.css`
- `src/mandarin_practice/practice.py`
- `src/mandarin_practice/audio.py`
- `src/mandarin_practice/cards.py`
- `docs/ROADMAP.md`

## Implementation Notes

- Add a session manifest format under `lessons/audio/sessions/<session-id>/session.json`.
- Include card id, lesson id, prompt text, answer text, pinyin, notes, prompt audio path, answer audio path, and rating state.
- Add a CLI command or subcommand to generate a session from due cards, latest lesson, or a specific lesson.
- Upgrade the website to load a session manifest and play through cards.
- Keep the first version local-only; do not require public hosting.
- Manual rating can write to a downloadable/exported JSON file first if direct state sync is too large for the first slice.

## Acceptance Criteria

- A phone-sized viewport can start a session and advance through cards without keyboard input.
- The flow supports prompt audio, a configurable response gap, answer audio, and rating.
- The generated session manifest is deterministic enough for tests.
- The website still works when no session has been generated.
- Local lesson/audio files remain ignored by git.

## Verification

```bash
make test
uv run mandarin validate
uv run mandarin doctor
make website
```

Also verify the website in a mobile viewport and document any skipped manual checks.
