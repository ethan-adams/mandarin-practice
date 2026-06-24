.PHONY: doctor ingest extract expand practice

doctor:
	uv run mandarin doctor

ingest:
	uv run mandarin ingest --source ~/Downloads

extract:
	uv run mandarin extract

expand:
	uv run mandarin expand

practice:
	uv run mandarin practice --latest
