"""mandarin-api: the server-owned backend for Mandarin Practice.

See ../../VISION.md (2026-08-20 pivot) and ../../docs/BUILD-PLAN.md. Runs on the
Lightsail box beside CCP Signal, reusing its Postgres. FastAPI chosen to match the
box's Python tooling and the faster-whisper bindings.
"""

__version__ = "0.1.0"
