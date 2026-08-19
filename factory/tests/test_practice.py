from __future__ import annotations

import unittest
from datetime import date, timedelta

from mandarin_practice.cards import Card
from mandarin_practice.practice import _default_card_state, _record_attempt, _select_cards


class PracticeSchedulingTests(unittest.TestCase):
    def test_correct_answer_advances_due_date(self) -> None:
        card = Card(
            lesson_id="Ethan_260620",
            prompt_en="How would you say: I drink tea?",
            answer_zh="我喝茶。",
        )
        state = {"cards": {}}

        _record_attempt(state, card, "y")

        item = state["cards"][card.id]
        self.assertEqual(item["attempts"], 1)
        self.assertEqual(item["correct"], 1)
        self.assertEqual(item["misses"], 0)
        self.assertEqual(item["interval_days"], 1)
        self.assertEqual(item["due"], (date.today() + timedelta(days=1)).isoformat())

    def test_wrong_answer_remains_due_today(self) -> None:
        card = Card(
            lesson_id="Ethan_260620",
            prompt_en="How would you say: I drink tea?",
            answer_zh="我喝茶。",
        )
        state = {"cards": {}}

        _record_attempt(state, card, "n")

        item = state["cards"][card.id]
        self.assertEqual(item["attempts"], 1)
        self.assertEqual(item["correct"], 0)
        self.assertEqual(item["misses"], 1)
        self.assertEqual(item["interval_days"], 0)
        self.assertEqual(item["due"], date.today().isoformat())

    def test_review_mode_selects_only_due_cards(self) -> None:
        due_card = Card("Lesson", "Due prompt", "Due answer")
        later_card = Card("Lesson", "Later prompt", "Later answer")
        state = {
            "cards": {
                due_card.id: _default_card_state(due_card),
                later_card.id: {
                    **_default_card_state(later_card),
                    "due": (date.today() + timedelta(days=3)).isoformat(),
                    "attempts": 1,
                },
            }
        }

        selected = _select_cards([later_card, due_card], state, mode="review", limit=0, seed=None)

        self.assertEqual(selected, [due_card])


if __name__ == "__main__":
    unittest.main()
