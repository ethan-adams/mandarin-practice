from __future__ import annotations

import unittest

from mandarin_practice.cards import Card
from mandarin_practice.export import build_corpus


class ExportTests(unittest.TestCase):
    def test_build_corpus_maps_to_app_schema(self) -> None:
        cards = [
            Card(lesson_id="Ethan_260620", prompt_en="tea?", answer_zh="茶。", pinyin="cha2.", notes="hint"),
            Card(lesson_id="Ethan_260620", prompt_en="water", answer_zh="水", pinyin="shui3"),
            Card(lesson_id="Ethan_260701", prompt_en="hello", answer_zh="你好", pinyin="ni3 hao3"),
        ]
        corpus = build_corpus(cards)

        self.assertEqual(corpus["card_count"], 3)
        self.assertEqual(corpus["lesson_count"], 2)  # two distinct lesson ids

        first = corpus["cards"][0]
        # camelCase keys the Svelte app reads, plus a stable id.
        self.assertEqual(
            set(first),
            {"id", "lessonId", "promptEn", "answerZh", "pinyin", "notes"},
        )
        self.assertEqual(first["lessonId"], "Ethan_260620")
        self.assertEqual(first["promptEn"], "tea?")
        self.assertEqual(first["answerZh"], "茶。")
        self.assertEqual(first["pinyin"], "cha2.")
        self.assertEqual(first["id"], cards[0].id)

    def test_notes_only_present_when_set(self) -> None:
        corpus = build_corpus([Card(lesson_id="L", prompt_en="p", answer_zh="答", pinyin="da2")])
        self.assertNotIn("notes", corpus["cards"][0])

    def test_empty_input_is_valid(self) -> None:
        corpus = build_corpus([])
        self.assertEqual(corpus, {"card_count": 0, "lesson_count": 0, "cards": []})


if __name__ == "__main__":
    unittest.main()
