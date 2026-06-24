from __future__ import annotations

import json
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.ingest import ingest_lessons


class IngestTests(unittest.TestCase):
    def test_ingest_copies_new_lessons_and_skips_duplicate_content(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            raw = root / "raw"
            source.mkdir()
            raw.mkdir()
            (source / "Ethan_260620.pdf").write_bytes(b"same lesson bytes")
            (source / "Ethan_260621.pdf").write_bytes(b"same lesson bytes")

            with patch("mandarin_practice.ingest.RAW_DIR", raw), patch(
                "mandarin_practice.ingest.ensure_project_dirs"
            ), contextlib.redirect_stdout(io.StringIO()):
                ingest_lessons(source, "Ethan_*.pdf")

            manifest = json.loads((raw / "manifest.json").read_text(encoding="utf-8"))
            pdfs = sorted(path.name for path in raw.glob("*.pdf"))

        self.assertEqual(len(manifest["lessons"]), 1)
        self.assertEqual(len(pdfs), 1)
        self.assertEqual(pdfs[0], "Ethan_260620.pdf")


if __name__ == "__main__":
    unittest.main()
