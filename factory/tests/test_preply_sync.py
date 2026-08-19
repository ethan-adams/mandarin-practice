from __future__ import annotations

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.preply_sync import PreplyMaterial, sync_preply_lessons


class FakePreplyAdapter:
    def __init__(self, materials: list[PreplyMaterial]) -> None:
        self.materials = materials
        self.calls: list[dict[str, object]] = []

    def sync(self, **kwargs: object) -> list[PreplyMaterial]:
        self.calls.append(kwargs)
        return self.materials


class PreplySyncTests(unittest.TestCase):
    def test_dry_run_lists_candidates_without_importing(self) -> None:
        adapter = FakePreplyAdapter([PreplyMaterial(url="https://example.test/lesson.pdf", filename="lesson.pdf")])

        output = io.StringIO()
        with patch("mandarin_practice.preply_sync.ingest_lessons") as ingest, contextlib.redirect_stdout(output):
            sync_preply_lessons(
                profile_dir=Path("~/profile"),
                staging_dir=Path("~/staging"),
                dry_run=True,
                adapter=adapter,
            )

        self.assertIn("candidate lesson.pdf: https://example.test/lesson.pdf", output.getvalue())
        self.assertTrue(adapter.calls[0]["dry_run"])
        ingest.assert_not_called()

    def test_downloaded_pdfs_are_handed_to_preply_import(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            staging = Path(tmp) / "staging"
            downloaded = staging / "Preply lesson notes 2026-06-24.pdf"
            adapter = FakePreplyAdapter(
                [
                    PreplyMaterial(
                        url="https://example.test/lesson.pdf",
                        filename=downloaded.name,
                        path=downloaded,
                    )
                ]
            )

            with patch("mandarin_practice.preply_sync.ingest_lessons") as ingest, contextlib.redirect_stdout(io.StringIO()):
                sync_preply_lessons(
                    profile_dir=Path(tmp) / "profile",
                    staging_dir=staging,
                    adapter=adapter,
                )

        ingest.assert_called_once_with(staging, "*.pdf", normalize_preply=True)


if __name__ == "__main__":
    unittest.main()
