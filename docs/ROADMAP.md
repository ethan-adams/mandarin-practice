# Roadmap

## Current Status

- The local CLI workflow can ingest Preply-style lesson PDFs, optionally stage PDFs from a logged-in local Preply browser profile, extract text, validate structured cards, drill due cards, and run spoken call/response sessions.
- Audio answers can use macOS voices or the optional Edge neural TTS backend, with generated Edge audio cached locally.
- The static website can load a generated local session manifest and run a phone-sized prompt, response gap, answer, speed selection, and rating loop.
- The website can attempt advisory Mandarin speech recognition during the response gap when the browser supports Web Speech APIs, then include the coarse result in exported session ratings.
- Latest imported PDF: `lessons/raw/Ethan_260624.pdf`
- Latest extracted text: `lessons/extracted/Ethan_260624.txt`
- Latest structured lesson deck: `lessons/structured/Ethan_260624.json`

Agent-ready tickets live in [docs/issue-backlog.md](issue-backlog.md). Use prompts like `Start issue 1. Follow AGENTS.md.`

## Near-Term Target

Keep improving the hands-off practice flow that works from a phone:

1. Done: generate a practice session from due cards or the latest lesson.
2. Done: prebuild English prompt and Mandarin answer audio for every card in the session.
3. Done: serve a mobile web player from the local machine.
4. Done: let the phone run through prompt, response gap, answer, repeat, and rating with minimal tapping.
5. Sync ratings back into `lessons/state/review.json`.

This should be audio-file-first instead of live-TTS-first. Phones are much easier to support when the session has ready-to-play files and metadata before practice starts.

## 1. Auto Import Preply Lesson PDFs

Goal: make weekly lesson import automatic and reliable.

- Done: add a `mandarin import-preply` command that scans a configured local folder.
- Done: support filename normalization from Preply exports into `Ethan_YYMMDD.pdf`.
- Done: store source path, original filename, imported timestamp, file hash, and lesson date in `lessons/raw/manifest.json`.
- Done: add duplicate detection by hash and lesson date.
- Done: add a dry-run mode so import rules can be checked without copying files.
- Later: store source URL when an upstream export includes one.
- Done: add optional direct Preply browser sync from a local logged-in browser profile; keep manual PDF download plus `import-preply` as the dependable fallback.

## 2. High-Quality Audio Pipeline

Goal: make premium audio the default output path, not an afterthought.

- Introduce an explicit audio build step:

  ```bash
  uv run mandarin audio build --lesson Ethan_260624 --backend edge
  ```

- Generate and cache separate files for English prompts, Mandarin answers, slow Mandarin answers, and optional repeats.
- Store audio metadata beside each card: backend, voice, speaking rate, source text hash, generated timestamp, and duration.
- Use Edge neural TTS as the free high-quality default for now, with Azure Speech as the eventual paid/pro path.
- Keep macOS `say` as a local fallback only.
- Add validation that flags cards missing audio before a phone session is generated.
- Add MP3 session export for fully offline listening:

  ```bash
  uv run mandarin audio export --mode review --limit 25
  ```

## 3. Speed Adjuster

Goal: make slower listening a first-class control across CLI, audio export, and mobile web.

- Done: keep `--mandarin-rate` and `--english-rate` in the CLI, but expose named presets: slow, normal, fast.
- Done: prebuild at least two Mandarin speeds per answer, normal and slow.
- Done: add a mobile web speed control that switches between prebuilt slow/normal files instead of relying only on browser playback speed.
- For generated session MP3s, include optional slow-answer repeats after the normal answer.
- Track preferred speed in local settings so practice sessions default to the last useful pace.

## 4. Pronunciation Recognition

Goal: give Duolingo-style feedback without letting imperfect recognition block practice.

- Done: start with browser speech recognition for the mobile web flow where available.
- Done: compare recognized Mandarin text against `answer_zh`, allowing common punctuation, whitespace, and simple variant differences.
- Done: include recognition results in exported session ratings.
- Done: add simple feedback first: matched, close, missed, or no speech detected.
- Later, add phoneme or pinyin-level scoring using a speech provider that supports pronunciation assessment.
- Keep manual self-rating available because automatic Mandarin pronunciation scoring will be noisy at first.

## Suggested Build Order

1. Done: add `mandarin audio build` to pre-generate prompt and answer audio for selected cards.
2. Done: add a generated `lessons/audio/sessions/<session-id>/session.json` manifest.
3. Done: upgrade the website into a mobile session player that consumes that manifest.
4. Done: add hands-off playback controls: autoplay, response gap duration, repeat answer, and simple rating.
5. Done: add Preply auto-import once the lesson-to-session pipeline is stable.
6. Done: add slow/normal speed controls for generated sessions and the phone player.
7. Done: add pronunciation recognition after the phone practice loop is usable without it.
