from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import patch

from mandarin_practice.audio import (
    _audio_cache_path,
    _audio_metadata,
    _edge_rate,
    _metadata_path,
    _resolve_rates,
    _voice_for_card,
)
from mandarin_practice.cards import Card


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

    def test_speed_presets_resolve_to_rates_with_numeric_overrides(self) -> None:
        self.assertEqual(_resolve_rates("slow"), (150, 115))
        self.assertEqual(_resolve_rates("normal", mandarin_rate=135), (170, 135))
        self.assertEqual(_resolve_rates("fast", english_rate=175), (175, 180))

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

    def test_metadata_path_keeps_audio_suffix_visible(self) -> None:
        self.assertEqual(_metadata_path(Path("/tmp/answer.mp3")), Path("/tmp/answer.mp3.json"))

    def test_audio_metadata_records_card_backend_and_text_hash(self) -> None:
        card = Card("Ethan_260624", "How would you say hello?", "你好")
        with patch("mandarin_practice.audio.PROJECT_ROOT", Path("/tmp/project")):
            metadata = _audio_metadata(
                card=card,
                role="answer",
                text=card.answer_zh,
                requested_backend="edge",
                actual_backend="edge",
                voice="zh-CN-XiaoxiaoNeural",
                rate="-10%",
                audio_path=Path("/tmp/project/lessons/audio/cache/answer.mp3"),
            )

        self.assertEqual(metadata["version"], 1)
        self.assertEqual(metadata["card_id"], card.id)
        self.assertEqual(metadata["lesson_id"], "Ethan_260624")
        self.assertEqual(metadata["role"], "answer")
        self.assertEqual(metadata["requested_backend"], "edge")
        self.assertEqual(metadata["backend"], "edge")
        self.assertEqual(metadata["voice"], "zh-CN-XiaoxiaoNeural")
        self.assertEqual(metadata["rate"], "-10%")
        self.assertEqual(metadata["audio_path"], "lessons/audio/cache/answer.mp3")
        self.assertEqual(len(metadata["text_hash"]), 64)


if __name__ == "__main__":
    unittest.main()
