"""Load a corpus JSON into the DB. Run on the box after deploy:

    python -m scripts.seed_content            # uses ../public/mandarin-source.json
    python -m scripts.seed_content /path.json

Honors MANDARIN_DATABASE_URL. Idempotent full-replace.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

from app.db import get_sessionmaker, init_models
from app.seed import seed_payload

DEFAULT_PATH = Path(__file__).resolve().parents[2] / "public" / "mandarin-source.json"


async def main(path: Path) -> None:
    payload = json.loads(path.read_text())
    await init_models()
    async with get_sessionmaker()() as session:
        counts = await seed_payload(session, payload)
    print(f"seeded {counts['units']} units, {counts['cards']} cards from {path}")


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    asyncio.run(main(target))
