from __future__ import annotations

import json
import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.ingest import ingest_lessons, normalize_preply_filename


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

    def test_normalize_preply_filename_infers_common_dates(self) -> None:
        self.assertEqual(
            normalize_preply_filename("Preply lesson notes 2026-06-24.pdf"),
            "Ethan_260624.pdf",
        )
        self.assertEqual(
            normalize_preply_filename("Mandarin lesson Jun 24, 2026.pdf"),
            "Ethan_260624.pdf",
        )
        self.assertEqual(
            normalize_preply_filename("Ethan_260624.pdf"),
            "Ethan_260624.pdf",
        )
        self.assertEqual(
            normalize_preply_filename("lesson-without-date.pdf"),
            "lesson-without-date.pdf",
        )

    def test_preply_dry_run_reports_normalized_name_without_copying(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            raw = root / "raw"
            source.mkdir()
            raw.mkdir()
            (source / "Preply lesson notes 2026-06-24.pdf").write_bytes(b"lesson bytes")

            output = io.StringIO()
            with patch("mandarin_practice.ingest.RAW_DIR", raw), patch(
                "mandarin_practice.ingest.ensure_project_dirs"
            ), contextlib.redirect_stdout(output):
                ingest_lessons(source, "*.pdf", dry_run=True, normalize_preply=True)

            self.assertIn(
                "would import Preply lesson notes 2026-06-24.pdf -> Ethan_260624.pdf",
                output.getvalue(),
            )
            self.assertFalse((raw / "Ethan_260624.pdf").exists())
            self.assertFalse((raw / "manifest.json").exists())

    def test_preply_import_preserves_original_filename_and_lesson_date(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            raw = root / "raw"
            source.mkdir()
            raw.mkdir()
            (source / "Preply lesson notes 2026-06-24.pdf").write_bytes(b"lesson bytes")

            with patch("mandarin_practice.ingest.RAW_DIR", raw), patch(
                "mandarin_practice.ingest.ensure_project_dirs"
            ), contextlib.redirect_stdout(io.StringIO()):
                ingest_lessons(source, "*.pdf", normalize_preply=True)

            manifest = json.loads((raw / "manifest.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["lessons"][0]["filename"], "Ethan_260624.pdf")
        self.assertEqual(
            manifest["lessons"][0]["original_filename"],
            "Preply lesson notes 2026-06-24.pdf",
        )
        self.assertEqual(manifest["lessons"][0]["lesson_date"], "2026-06-24")

    def test_preply_import_skips_duplicate_inferred_lesson_date(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source"
            raw = root / "raw"
            source.mkdir()
            raw.mkdir()
            (source / "Preply lesson notes 2026-06-24.pdf").write_bytes(b"first lesson bytes")
            (source / "Mandarin class Jun 24, 2026.pdf").write_bytes(b"updated lesson bytes")

            output = io.StringIO()
            with patch("mandarin_practice.ingest.RAW_DIR", raw), patch(
                "mandarin_practice.ingest.ensure_project_dirs"
            ), contextlib.redirect_stdout(output):
                ingest_lessons(source, "*.pdf", normalize_preply=True)

            manifest = json.loads((raw / "manifest.json").read_text(encoding="utf-8"))
            pdfs = sorted(path.name for path in raw.glob("*.pdf"))

        self.assertEqual(len(manifest["lessons"]), 1)
        self.assertEqual(pdfs, ["Ethan_260624.pdf"])
        self.assertIn("lesson date 2026-06-24 already imported", output.getvalue())


if __name__ == "__main__":
    unittest.main()
