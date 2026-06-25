from __future__ import annotations

import json
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.session import build_session


class SessionBuildTests(unittest.TestCase):
    def test_build_session_rejects_path_like_session_id(self) -> None:
        with self.assertRaisesRegex(ValueError, "session_id"):
            build_session(session_id="../outside")

    def test_build_session_writes_manifest_with_audio_paths_and_rating_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            structured = root / "lessons" / "structured"
            sessions = root / "lessons" / "audio" / "sessions"
            cache = root / "lessons" / "audio" / "cache"
            state_dir = root / "lessons" / "state"
            structured.mkdir(parents=True)
            cache.mkdir(parents=True)
            state_dir.mkdir(parents=True)
            structured.joinpath("Ethan_260624.json").write_text(
                json.dumps(
                    {
                        "lesson_id": "Ethan_260624",
                        "date": "2026-06-24",
                        "cards": [
                            {
                                "prompt_en": "How would you say: I drink tea?",
                                "answer_zh": "我喝茶。",
                                "pinyin": "wo3 he1 cha2.",
                                "notes": "Use 喝 for drink.",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            prompt_path = cache / "prompt.mp3"
            answer_path = cache / "answer.mp3"
            prompt_path.write_bytes(b"prompt")
            answer_path.write_bytes(b"answer")

            def fake_build_audio_file(text, backend, voice, fallback_voice, rate):
                if text.startswith("How would"):
                    return prompt_path, "edge", "-10%", True, voice
                return answer_path, "edge", "-10%", True, voice

            with patch("mandarin_practice.cards.STRUCTURED_DIR", structured), patch(
                "mandarin_practice.cards.ensure_project_dirs"
            ), patch("mandarin_practice.session.STRUCTURED_DIR", structured), patch(
                "mandarin_practice.session.AUDIO_SESSIONS_DIR", sessions
            ), patch(
                "mandarin_practice.session.ensure_project_dirs"
            ), patch(
                "mandarin_practice.session._load_state", return_value={"version": 1, "cards": {}}
            ), patch(
                "mandarin_practice.session._available_say_voices", return_value=[]
            ), patch(
                "mandarin_practice.session._build_audio_file", side_effect=fake_build_audio_file
            ), patch(
                "mandarin_practice.audio.PROJECT_ROOT", root
            ), patch(
                "mandarin_practice.session._relative_path",
                side_effect=lambda path: str(path.relative_to(root)),
            ):
                with redirect_stdout(StringIO()):
                    stats = build_session(latest=True, session_id="test", limit=1, seed=123)

            manifest = json.loads((sessions / "test" / "session.json").read_text(encoding="utf-8"))

        self.assertEqual(stats.cards, 1)
        self.assertEqual(stats.reused, 2)
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(manifest["session_id"], "test")
        self.assertEqual(manifest["selection"]["seed"], 123)
        self.assertEqual(manifest["playback"]["response_gap_seconds"], 5)
        self.assertEqual(len(manifest["cards"]), 1)
        card = manifest["cards"][0]
        self.assertEqual(card["lesson_id"], "Ethan_260624")
        self.assertEqual(card["prompt_text"], "How would you say: I drink tea?")
        self.assertEqual(card["answer_text"], "我喝茶。")
        self.assertEqual(card["pinyin"], "wǒ hē chá.")
        self.assertEqual(card["prompt_audio_path"], "lessons/audio/cache/prompt.mp3")
        self.assertEqual(card["answer_audio_path"], "lessons/audio/cache/answer.mp3")
        self.assertEqual(card["rating_state"]["attempts"], 0)


if __name__ == "__main__":
    unittest.main()
