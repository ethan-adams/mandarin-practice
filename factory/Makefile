.PHONY: doctor ingest extract expand validate today stats practice speak website test

doctor:
	uv run mandarin doctor

ingest:
	uv run mandarin ingest --source ~/Downloads

extract:
	uv run mandarin extract

expand:
	uv run mandarin expand

validate:
	uv run mandarin validate

today:
	uv run mandarin today

speak:
	uv run mandarin speak

website:
	python3 -m http.server 5173

stats:
	uv run mandarin stats

practice:
	uv run mandarin practice --latest

test:
	uv run python -m unittest discover -s tests
	node --test website/pronunciation.test.mjs
