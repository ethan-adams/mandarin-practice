from __future__ import annotations

import re


TONE_MARKS = {
    "a": ("ā", "á", "ǎ", "à"),
    "e": ("ē", "é", "ě", "è"),
    "i": ("ī", "í", "ǐ", "ì"),
    "o": ("ō", "ó", "ǒ", "ò"),
    "u": ("ū", "ú", "ǔ", "ù"),
    "ü": ("ǖ", "ǘ", "ǚ", "ǜ"),
    "A": ("Ā", "Á", "Ǎ", "À"),
    "E": ("Ē", "É", "Ě", "È"),
    "I": ("Ī", "Í", "Ǐ", "Ì"),
    "O": ("Ō", "Ó", "Ǒ", "Ò"),
    "U": ("Ū", "Ú", "Ǔ", "Ù"),
    "Ü": ("Ǖ", "Ǘ", "Ǚ", "Ǜ"),
}

PINYIN_SYLLABLE_RE = re.compile(r"[A-Za-züÜvV:]+[1-5]")


def numbered_to_accented_pinyin(text: str) -> str:
    """Convert numbered pinyin syllables such as `nu:3 er2` to `nǚ ér`."""
    return PINYIN_SYLLABLE_RE.sub(lambda match: _convert_syllable(match.group(0)), text)


def _convert_syllable(syllable: str) -> str:
    tone = int(syllable[-1])
    base = syllable[:-1].replace("u:", "ü").replace("U:", "Ü").replace("v", "ü").replace("V", "Ü")
    if tone == 5:
        return base

    mark_index = _tone_mark_index(base)
    if mark_index is None:
        return base

    char = base[mark_index]
    marked = TONE_MARKS.get(char, (char, char, char, char))[tone - 1]
    return f"{base[:mark_index]}{marked}{base[mark_index + 1:]}"


def _tone_mark_index(syllable: str) -> int | None:
    lower = syllable.lower()
    for vowel in ("a", "e"):
        index = lower.find(vowel)
        if index >= 0:
            return index

    ou_index = lower.find("ou")
    if ou_index >= 0:
        return ou_index

    for index in range(len(syllable) - 1, -1, -1):
        if lower[index] in {"i", "o", "u", "ü"}:
            return index
    return None
