from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from mandarin_practice.cards import load_lesson


class CardLoadingTests(unittest.TestCase):
    def test_load_lesson_accepts_expected_card_format(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Ethan_260620.json"
            path.write_text(
                json.dumps(
                    {
                        "lesson_id": "Ethan_260620",
                        "date": "2026-06-20",
                        "cards": [
                            {
                                "prompt_en": "How would you say: I want tea?",
                                "answer_zh": "我想喝茶。",
                                "pinyin": "wo3 xiang3 he1 cha2.",
                                "notes": "Practice 想 + verb.",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            lesson = load_lesson(path)

        self.assertEqual(lesson.lesson_id, "Ethan_260620")
        self.assertEqual(lesson.date, "2026-06-20")
        self.assertEqual(len(lesson.cards), 1)
        self.assertEqual(lesson.cards[0].answer_zh, "我想喝茶。")
        self.assertEqual(lesson.cards[0].pinyin, "wo3 xiang3 he1 cha2.")

    def test_load_lesson_rejects_cards_without_answers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text(
                json.dumps(
                    {
                        "lesson_id": "BadLesson",
                        "cards": [{"prompt_en": "How would you say: hello?"}],
                    }
                ),
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "missing answer_zh"):
                load_lesson(path)


if __name__ == "__main__":
    unittest.main()
