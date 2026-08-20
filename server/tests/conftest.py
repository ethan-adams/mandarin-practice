"""Point every test at a throwaway SQLite DB before the app imports settings.

Using a temp file (not :memory:) so the async engine's separate connections share
one database.
"""

from __future__ import annotations

import os
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix=".sqlite")
os.close(_db_fd)
os.environ.setdefault("MANDARIN_DATABASE_URL", f"sqlite+aiosqlite:///{_db_path}")
os.environ.setdefault("MANDARIN_SESSION_SECRET", "test-secret")
