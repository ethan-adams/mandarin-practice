from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.cli import main


class CliTests(unittest.TestCase):
    def test_preply_sync_arguments_are_forwarded(self) -> None:
        argv = [
            "mandarin",
            "preply",
            "sync",
            "--profile-dir",
            "~/profile",
            "--staging-dir",
            "~/stage",
            "--start-url",
            "https://preply.example/home",
            "--limit",
            "3",
            "--dry-run",
        ]

        with patch("sys.argv", argv), patch("mandarin_practice.cli.sync_preply_lessons") as sync:
            main()

        sync.assert_called_once_with(
            profile_dir=Path("~/profile"),
            staging_dir=Path("~/stage"),
            start_url="https://preply.example/home",
            dry_run=True,
            limit=3,
        )


if __name__ == "__main__":
    unittest.main()
