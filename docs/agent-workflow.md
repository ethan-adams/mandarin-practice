# Agent Workflow

Use this workflow for autonomous issue work.

## Starting an Issue

When the user says `start issue 1`, map the number through `docs/issue-backlog.md`, then read the linked issue file in `docs/issues/`.

Each issue file includes:

- Goal
- Context
- Suggested files to inspect
- Implementation notes
- Acceptance criteria
- Verification

Treat acceptance criteria as the contract. If an issue is too large to finish in one clean slice, implement the first useful slice and update the issue with what remains.

## Local Checks

Run this before considering work complete:

```bash
make test
uv run mandarin validate
```

Run `uv run mandarin doctor` when touching tooling, audio, extraction, imports, or website serving.

For website changes, start `make website` and verify the app at `http://localhost:5173/website/`.

## Branch and Commit Rules

- `feature/<issue>-short-name` for user-facing practice features.
- `chore/<issue>-short-name` for repo harness, import plumbing, and maintenance.
- `docs/<issue>-short-name` for documentation-only changes.
- Prefer one focused commit per issue.
- Use conventional commit prefixes.

## Done Notes

Final status should include:

- Issue completed or partially completed.
- Files changed.
- Checks run and results.
- Any manual verification skipped.
