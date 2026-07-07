# Mandarin Practice Agent Notes

## Working Style

This repo is a practical personal learning tool. Prefer small, complete slices that keep the weekly Mandarin workflow moving. Make reasonable implementation choices independently after inspecting the code and docs.

Ask before work that requires private credentials, paid services, public deployment, destructive git operations, or broad rewrites outside the issue scope.

## Agentic Harness

When given a request like `start issue 1`, `work issue 1`, or `do MLP-1`, use the local issue backlog:

1. Inspect `docs/issue-backlog.md`.
2. Open the matching file under `docs/issues/`.
3. Restate the issue as a concrete implementation target.
4. Inspect the relevant code and docs before editing.
5. Create or switch to a task branch for substantive work. Use names like `feature/1-phone-session-player`, `chore/2-preply-import`, or `docs/5-pronunciation-plan`.
6. Implement the smallest complete slice that satisfies the issue acceptance criteria.
7. Run `make test` and any issue-specific checks before committing.
8. Commit one coherent change with a conventional prefix such as `feat:`, `fix:`, `chore:`, `docs:`, or `test:`.
9. Merge the completed task branch into `main`.
10. Push `main` to `origin` at the end of each completed task.

This repo uses direct-to-main workflow by default. Do not open a PR or leave a
completed task only on a feature branch unless the user explicitly asks for PR
flow or asks you not to push.

Any intentional repo change should end with a commit and push, including
documentation-only updates, backlog changes, and stopping-point notes. Do not
leave useful edits uncommitted at the end of a turn unless the user explicitly
asks not to commit or push.

## Verification Baseline

Use these checks by default:

```bash
make test
uv run mandarin validate
uv run mandarin doctor
```

For website changes, also run the local server and verify the page manually or with browser automation:

```bash
make website
```

## Project Direction

- Lesson PDFs, extracted text, structured cards, audio, and review state stay local by default.
- The CLI remains the source of truth for ingest, extraction, card validation, practice selection, and review state.
- Phone practice should use generated session manifests and prebuilt audio files instead of relying on live TTS from a browser.
- High-quality audio should be cached, reproducible, and inspectable.
- Pronunciation scoring should augment practice, not block it; manual self-rating must remain available.

## Repo Hygiene

- Keep edits scoped to the issue.
- Commit and push scoped repo changes before handing work back to the user.
- Do not overwrite local lesson data or review history.
- Preserve ignored local lesson/audio files unless the issue explicitly targets them.
- Update `docs/ROADMAP.md` or `docs/issue-backlog.md` when a feature changes direction or an issue is completed.
