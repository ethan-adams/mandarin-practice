from __future__ import annotations

import unittest

from mandarin_practice.expand import generate_expanded_cards


class ExpandedPracticeTests(unittest.TestCase):
    def test_generated_cards_are_deterministic_for_same_seed(self) -> None:
        first = generate_expanded_cards(seed=123)
        second = generate_expanded_cards(seed=123)

        self.assertEqual(first, second)

    def test_generated_cards_are_marked_and_deduplicated(self) -> None:
        cards = generate_expanded_cards(seed=260620)
        pairs = {(card["prompt_en"], card["answer_zh"]) for card in cards}

        self.assertEqual(len(cards), len(pairs))
        self.assertTrue(cards)
        self.assertTrue(all(card["generated"] for card in cards))


if __name__ == "__main__":
    unittest.main()
