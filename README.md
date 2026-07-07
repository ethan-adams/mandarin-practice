# Mandarin Lesson Practice

Local tools for turning tutor lesson PDFs named `Ethan_YYMMDD.pdf` into call/response Mandarin practice.

The repo intentionally does not commit lesson PDFs, extracted text, generated cards, or audio. Those files stay local under `lessons/`.

## Current Workflow

```bash
uv run mandarin doctor
uv run mandarin ingest --source ~/Downloads
uv run mandarin import-preply --source ~/Downloads --dry-run
uv run mandarin preply sync --dry-run
uv run mandarin extract
uv run mandarin expand
uv run mandarin validate
uv run mandarin today
```

For normal daily use, run:

```bash
uv run mandarin today
```

That practices cards due today, speaks each Mandarin answer with the local
`Tingting` voice, and saves your review history under `lessons/state/`.

Useful follow-ups:

```bash
uv run mandarin speak
uv run mandarin stats
uv run mandarin practice --mode new --limit 20
uv run mandarin practice --latest
uv run mandarin practice --lesson Ethan_260624
uv run mandarin practice --no-audio
```

For audiobook-style call/response practice, run:

```bash
uv run mandarin speak --limit 10
```

The tool speaks the English prompt, records your spoken Mandarin response,
plays the native Mandarin answer, then replays your recording so you can compare.
Responses are saved under `lessons/audio/responses/`.

Useful voice options:

```bash
uv run mandarin speak --mandarin-voice "Sandy (Chinese (China mainland))"
uv run mandarin speak --mandarin-voice "Tingting (Chinese (China mainland))"
uv run mandarin speak --seconds 7 --no-replay
uv run mandarin speak --single-voice
uv run mandarin speak --speed slow
uv sync --extra edge
uv run mandarin speak --tts-backend edge
uv run mandarin speak --tts-backend edge --edge-voice zh-CN-YunxiNeural
```

Prebuild high-quality prompt and answer audio for later phone/web sessions:

```bash
uv run mandarin audio build --latest --limit 10
uv run mandarin audio build --lesson Ethan_260624 --tts-backend edge
uv run mandarin audio build --latest --speed slow
uv run mandarin audio build --mode review --limit 25 --single-voice
```

The audio builder caches generated files under `lessons/audio/cache/` and writes
sidecar metadata next to each audio file. Edge neural TTS is the default backend;
if Edge is unavailable, the builder falls back to macOS `say`. Named speed
presets are `slow`, `normal`, and `fast`; direct `--english-rate` and
`--mandarin-rate` options still override the selected preset.

Build a phone-friendly hands-off session manifest with prebuilt prompt and
answer audio:

```bash
uv run mandarin session build --latest --limit 10
uv run mandarin session build --mode review --limit 25 --response-gap 7
uv run mandarin session build --latest --limit 10 --speed slow
```

Session manifests are written under `lessons/audio/sessions/<session-id>/`.
The default session id is `latest`, so the website can load
`lessons/audio/sessions/latest/session.json` automatically. Session manifests
include normal and slow Mandarin answer audio variants so the website can switch
speed without relying only on browser playback-rate changes.

By default, `speak` rotates Mandarin voice profiles across answers when macOS
has multiple Chinese voices installed. Install additional Mandarin voices in
System Settings if you want stronger male/female/young/old contrast.

For the biggest free audio upgrade, install the optional Edge backend with
`uv sync --extra edge` and run `speak --tts-backend edge`. Edge audio is
generated once and cached under `lessons/audio/cache/` by voice, rate, and text,
then reused on later cards. If Edge TTS is unavailable or fails, the CLI falls
back to macOS `say`.

The `--tts-backend azure` option is reserved for the official Azure Speech path.
Until Azure credentials and quota handling are added, it reports the missing
configuration and falls back to `say`.

## Local Website

Run the static practice dashboard from the repo root:

```bash
make website
```

Then open `http://localhost:5173/website/`. The page includes the Edge backend
setup command and a phone-sized session player that uses your local
`lessons/audio/sessions/latest/session.json` manifest when it exists. Lesson
audio and session files are intentionally not committed, so a fresh clone still
opens cleanly before any local session is generated.

For planned phone practice, Preply import automation, higher-quality audio,
speed controls, and pronunciation feedback, see [docs/ROADMAP.md](docs/ROADMAP.md).
For agent-ready implementation slices, see [docs/issue-backlog.md](docs/issue-backlog.md)
and [AGENTS.md](AGENTS.md).

## Optional Preply Browser Sync

Manual download plus `import-preply` remains the reliable fallback. If you want
the CLI to reuse a local logged-in Preply browser session, install the optional
browser automation dependency:

```bash
uv sync --extra preply
uv run playwright install chromium
uv run mandarin preply sync --dry-run
```

The first `preply sync` run opens Preply in a dedicated browser profile under
`~/.local/share/mandarin-practice/preply-browser-profile`. Log in manually in
that browser window, then press Enter in the terminal or rerun the command. The
CLI does not accept or store Preply passwords. Downloaded PDF candidates are staged under
`~/.local/share/mandarin-practice/preply-downloads` and then imported through
the same normalization, duplicate detection, and raw manifest path used by
`import-preply`.

## System Shape

1. `ingest` copies new `Ethan_*.pdf` files into `lessons/raw/` and records metadata.
   `import-preply` scans broader PDF downloads, infers lesson dates, and normalizes names like `Ethan_YYMMDD.pdf`.
2. `extract` turns PDFs into text under `lessons/extracted/`.
3. Lesson text is reviewed or transformed into structured cards under `lessons/structured/`.
4. `validate` checks structured cards before practice.
5. `today` runs a due-card call/response loop and updates review history.
6. `speak` runs audiobook-style voice response practice and records your answers.
7. `session build` creates a phone web session manifest plus prompt and answer audio.
8. `practice` can drill all cards, new cards, a lesson, or the latest lesson.
9. `preply sync` can optionally stage likely Preply PDF materials from a local
   logged-in browser profile before handing them to `import-preply` logic.
10. `expand` creates extra practice from the lesson patterns you have already seen.
11. Later, `audio` can export prompt/silence/answer practice tracks.

Set `MANDARIN_PRACTICE_HOME=/path/to/project-or-data-root` if you want to run
the command from another folder while keeping lesson data in this repo.

## Recommended Local Tools

```bash
brew install poppler tesseract tesseract-lang ffmpeg
```

- `poppler`: PDF metadata and text extraction (`pdfinfo`, `pdftotext`)
- `tesseract` + `tesseract-lang`: OCR for scanned/image-only lesson PDFs
- `ffmpeg`: later MP3/audio assembly
- macOS `say`: local text-to-speech; already available on macOS
- Optional `edge-tts`: Microsoft Edge online neural voices, no API key

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
      "pinyin": "wǒ míng tiān xiǎng qù.",
      "notes": "Optional grammar or usage note."
    }
  ]
}
```

Numbered pinyin such as `wo3 ming2 tian1` is still accepted for older lesson
files. Practice output renders it with tone marks.

## Near-Term Milestones

- Add LLM-assisted conversion from extracted lesson text to cards.
- Tune spaced repetition scheduling.
- Add audio session export with English prompt, silence, Mandarin answer, repeat.
- Add a small local web UI after the CLI loop feels right.

## Extra Practice

Generate extrapolated cards:

```bash
uv run mandarin expand --count 120
```

Then practice them together with the lesson cards:

```bash
uv run mandarin practice
```

Or practice only the generated deck:

```bash
uv run mandarin practice --lesson Review_expanded
```
