from __future__ import annotations

import unittest

from mandarin_practice.pinyin import numbered_to_accented_pinyin


class PinyinFormattingTests(unittest.TestCase):
    def test_converts_numbered_tones_to_diacritics(self) -> None:
        self.assertEqual(
            numbered_to_accented_pinyin("wo3 ming2 tian1 xiang3 qu4."),
            "wǒ míng tiān xiǎng qù.",
        )

    def test_handles_u_umlaut_and_neutral_tone(self) -> None:
        self.assertEqual(numbered_to_accented_pinyin("nu:3 er2 zi5"), "nǚ ér zi")

    def test_keeps_already_accented_pinyin_unchanged(self) -> None:
        self.assertEqual(numbered_to_accented_pinyin("wǒ xiǎng hē chá."), "wǒ xiǎng hē chá.")


if __name__ == "__main__":
    unittest.main()
