# Issue 5: Add Pronunciation Recognition Feedback

## Goal

Add lightweight Duolingo-style pronunciation feedback while preserving manual self-rating.

## Context

The current `speak` command records responses and replays them for self-comparison. Pronunciation recognition should start simple: capture speech, compare recognized Mandarin text to the expected answer, and show coarse feedback.

## Suggested Files To Inspect

- `src/mandarin_practice/audio.py`
- `src/mandarin_practice/practice.py`
- `website/app.js`
- `website/index.html`
- `website/styles.css`
- `lessons/audio/responses/`
- `docs/ROADMAP.md`

## Implementation Notes

- Start in the browser if available through Web Speech APIs, because phone practice is the target.
- Treat recognition as advisory: matched, close, missed, or no speech detected.
- Keep manual rating buttons active even when recognition fails.
- Store recognition output with session results so future review can compare attempts.
- Normalize punctuation, whitespace, and simple Chinese variants before comparing text.
- Do not require a paid speech API in the first slice.
- Later work can add provider-backed pinyin or phoneme scoring.

## Acceptance Criteria

- Browser practice can attempt Mandarin speech recognition when supported.
- Unsupported browsers fail gracefully and keep manual practice usable.
- Recognition results are visible in the session UI and stored in session result data.
- Text comparison is covered by tests if implemented in Python or by a lightweight JS test harness if implemented in JS.
- Manual ratings still update or export exactly as before.

## Verification

```bash
make test
uv run mandarin validate
make website
```

Manually test in at least one browser with microphone permission if possible, and note any browser limitations.
