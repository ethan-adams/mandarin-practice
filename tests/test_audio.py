from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.audio import _audio_cache_path, _edge_rate, _voice_for_card


class AudioBackendTests(unittest.TestCase):
    def test_audio_cache_path_changes_with_voice_rate_and_text(self) -> None:
        with patch("mandarin_practice.audio.AUDIO_CACHE_DIR", Path("/tmp/audio-cache")):
            first = _audio_cache_path("edge", "zh-CN-XiaoxiaoNeural", "-10%", "你好", "mp3")
            same = _audio_cache_path("edge", "zh-CN-XiaoxiaoNeural", "-10%", "你好", "mp3")
            different_voice = _audio_cache_path("edge", "zh-CN-YunxiNeural", "-10%", "你好", "mp3")
            different_text = _audio_cache_path("edge", "zh-CN-XiaoxiaoNeural", "-10%", "再见", "mp3")

        self.assertEqual(first, same)
        self.assertNotEqual(first, different_voice)
        self.assertNotEqual(first, different_text)
        self.assertEqual(first.suffix, ".mp3")

    def test_edge_rate_defaults_slightly_slow(self) -> None:
        self.assertEqual(_edge_rate(150), "-10%")
        self.assertEqual(_edge_rate(180), "+10%")
        self.assertEqual(_edge_rate(60), "-50%")

    def test_edge_voice_profiles_rotate_neural_voices(self) -> None:
        first_voice, first_label, _ = _voice_for_card(
            1,
            fallback_voice="zh-CN-XiaoxiaoNeural",
            voice_variety=True,
            available_voices=[],
            backend="edge",
        )
        second_voice, second_label, _ = _voice_for_card(
            2,
            fallback_voice="zh-CN-XiaoxiaoNeural",
            voice_variety=True,
            available_voices=[],
            backend="edge",
        )

        self.assertEqual(first_voice, "zh-CN-XiaoxiaoNeural")
        self.assertEqual(first_label, "adult female")
        self.assertEqual(second_voice, "zh-CN-YunxiNeural")
        self.assertEqual(second_label, "younger male")


if __name__ == "__main__":
    unittest.main()
