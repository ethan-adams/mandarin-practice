.PHONY: doctor ingest extract practice

doctor:
	uv run mandarin doctor

ingest:
	uv run mandarin ingest --source ~/Downloads

extract:
	uv run mandarin extract

practice:
	uv run mandarin practice --latest

