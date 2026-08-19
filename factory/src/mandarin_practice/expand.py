from __future__ import annotations

import json
import random
from pathlib import Path

from mandarin_practice.paths import STRUCTURED_DIR, ensure_project_dirs
from mandarin_practice.pinyin import numbered_to_accented_pinyin


DEFAULT_OUTPUT = "Review_expanded.json"

NOUNS = [
    {"en": "teacher", "zh": "老师", "pinyin": "lao3 shi1", "mw": "个", "mw_py": "ge"},
    {"en": "student", "zh": "学生", "pinyin": "xue2 sheng1", "mw": "个", "mw_py": "ge"},
    {"en": "classmate", "zh": "同学", "pinyin": "tong2 xue2", "mw": "个", "mw_py": "ge"},
    {"en": "friend", "zh": "朋友", "pinyin": "peng2 you", "mw": "个", "mw_py": "ge"},
    {"en": "Chinese teacher", "zh": "汉语老师", "pinyin": "Han4 yu3 lao3 shi1", "mw": "个", "mw_py": "ge"},
    {"en": "Chinese book", "zh": "汉语书", "pinyin": "Han4 yu3 shu1", "mw": "本", "mw_py": "ben3"},
    {"en": "daughter", "zh": "女儿", "pinyin": "nu:3 er2", "mw": "个", "mw_py": "ge"},
    {"en": "son", "zh": "儿子", "pinyin": "er2 zi", "mw": "个", "mw_py": "ge"},
]

PEOPLE = [
    {"en": "I", "poss_en": "my", "zh": "我", "pinyin": "wo3", "be": "am", "do": "Do", "neg": "do not"},
    {"en": "you", "poss_en": "your", "zh": "你", "pinyin": "ni3", "be": "are", "do": "Do", "neg": "do not"},
    {"en": "he", "poss_en": "his", "zh": "他", "pinyin": "ta1", "be": "is", "do": "Does", "neg": "does not"},
    {"en": "she", "poss_en": "her", "zh": "她", "pinyin": "ta1", "be": "is", "do": "Does", "neg": "does not"},
    {"en": "we", "poss_en": "our", "zh": "我们", "pinyin": "wo3 men", "be": "are", "do": "Do", "neg": "do not"},
    {"en": "they", "poss_en": "their", "zh": "他们", "pinyin": "ta1 men", "be": "are", "do": "Do", "neg": "do not"},
]

COUNTRIES = [
    {"en": "American", "zh": "美国人", "pinyin": "Mei3 guo2 ren2"},
    {"en": "Chinese", "zh": "中国人", "pinyin": "Zhong1 guo2 ren2"},
    {"en": "British", "zh": "英国人", "pinyin": "Ying1 guo2 ren2"},
    {"en": "French", "zh": "法国人", "pinyin": "Fa3 guo2 ren2"},
    {"en": "German", "zh": "德国人", "pinyin": "De2 guo2 ren2"},
    {"en": "Spanish", "zh": "西班牙人", "pinyin": "Xi1 ban1 ya2 ren2"},
]

LANGUAGES = [
    {"en": "Chinese", "zh": "汉语", "pinyin": "Han4 yu3"},
    {"en": "English", "zh": "英语", "pinyin": "Ying1 yu3"},
    {"en": "French", "zh": "法语", "pinyin": "Fa3 yu3"},
    {"en": "German", "zh": "德语", "pinyin": "De2 yu3"},
    {"en": "Spanish", "zh": "西班牙语", "pinyin": "Xi1 ban1 ya2 yu3"},
]

NUMBERS = [
    (1, "one", "一", "yi1"),
    (2, "two", "两", "liang3"),
    (3, "three", "三", "san1"),
    (4, "four", "四", "si4"),
    (5, "five", "五", "wu3"),
    (6, "six", "六", "liu4"),
    (7, "seven", "七", "qi1"),
    (8, "eight", "八", "ba1"),
    (9, "nine", "九", "jiu3"),
    (10, "ten", "十", "shi2"),
    (12, "twelve", "十二", "shi2 er4"),
    (15, "fifteen", "十五", "shi2 wu3"),
    (20, "twenty", "二十", "er4 shi2"),
    (25, "twenty-five", "二十五", "er4 shi2 wu3"),
]

FOODS = [
    {"en": "pizza", "zh": "披萨", "pinyin": "pi1 sa4"},
    {"en": "sushi", "zh": "寿司", "pinyin": "shou4 si1"},
    {"en": "American food", "zh": "美国菜", "pinyin": "Mei3 guo2 cai4"},
    {"en": "Chinese food", "zh": "中国菜", "pinyin": "Zhong1 guo2 cai4"},
    {"en": "bananas", "zh": "香蕉", "pinyin": "xiang1 jiao1"},
    {"en": "chocolate", "zh": "巧克力", "pinyin": "qiao3 ke4 li4"},
]

MONTHS = [
    ("January", "一月", "yi1 yue4"),
    ("February", "二月", "er4 yue4"),
    ("March", "三月", "san1 yue4"),
    ("April", "四月", "si4 yue4"),
    ("May", "五月", "wu3 yue4"),
]


def _card(prompt: str, answer: str, pinyin: str, notes: str = "") -> dict:
    card = {
        "prompt_en": prompt,
        "answer_zh": answer,
        "pinyin": numbered_to_accented_pinyin(pinyin),
        "generated": True,
    }
    if notes:
        card["notes"] = notes
    return card


def _dedupe(cards: list[dict]) -> list[dict]:
    seen = set()
    unique = []
    for card in cards:
        key = (card["prompt_en"], card["answer_zh"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(card)
    return unique


def generate_expanded_cards(seed: int = 260620) -> list[dict]:
    rng = random.Random(seed)
    cards: list[dict] = []

    for person in PEOPLE:
        for country in COUNTRIES:
            cards.append(
                _card(
                    f"How would you say: {person['en']} {person['be']} {country['en']}?",
                    f"{person['zh']}是{country['zh']}。",
                    f"{person['pinyin']} shi4 {country['pinyin']}.",
                )
            )

    for person in PEOPLE[1:4]:
        cards.append(
            _card(
                f"How would you ask: What country is {person['en']} from?",
                f"{person['zh']}是哪国人？",
                f"{person['pinyin']} shi4 na3 guo2 ren2?",
            )
        )

    for person in PEOPLE[:4]:
        for noun in NOUNS:
            cards.append(
                _card(
                    f"How would you ask: {person['do']} {person['en']} have a {noun['en']}?",
                    f"{person['zh']}有{noun['zh']}吗？",
                    f"{person['pinyin']} you3 {noun['pinyin']} ma?",
                )
            )
            cards.append(
                _card(
                    f"How would you say: {person['en']} {person['neg']} have a {noun['en']}?",
                    f"{person['zh']}没有{noun['zh']}。",
                    f"{person['pinyin']} mei2 you3 {noun['pinyin']}.",
                )
            )

    for noun in NOUNS:
        cards.append(
            _card(
                f"How would you ask: How many {noun['en']}s do you have?",
                f"你有几{noun['mw']}{noun['zh']}？",
                f"ni3 you3 ji3 {noun['mw_py']} {noun['pinyin']}?",
                "Use 几 + measure word + noun.",
            )
        )
        for _, num_en, num_zh, num_py in rng.sample(NUMBERS, 4):
            cards.append(
                _card(
                    f"How would you say: I have {num_en} {noun['en']}(s).",
                    f"我有{num_zh}{noun['mw']}{noun['zh']}。",
                    f"wo3 you3 {num_py} {noun['mw_py']} {noun['pinyin']}.",
                    "Number + measure word + noun.",
                )
            )

    for count, num_en, num_zh, num_py in NUMBERS[:10]:
        people = "person" if count == 1 else "people"
        cards.append(
            _card(
                f"How would you say: My family has {num_en} {people}?",
                f"我家有{num_zh}口人。",
                f"wo3 jia1 you3 {num_py} kou3 ren2.",
                "口 is the measure word for family members.",
            )
        )

    for name in ["Tim", "Sarah", "Mary", "Mike"]:
        cards.append(_card(f"{name} is a child. Ask how old they are.", f"{name}几岁？", f"{name} ji3 sui4?"))
        cards.append(_card(f"{name} is a young adult. Ask how old they are.", f"{name}多大？", f"{name} duo1 da4?"))
        cards.append(
            _card(
                f"{name} is older. Ask their age respectfully.",
                f"{name}多大年纪？",
                f"{name} duo1 da4 nian2 ji4?",
            )
        )

    for _, num_en, num_zh, num_py in rng.sample(NUMBERS, 8):
        cards.append(
            _card(
                f"How would you say: She is {num_en} years old now?",
                f"她{num_zh}岁了。",
                f"ta1 {num_py} sui4 le.",
                "了 marks the current changed state.",
            )
        )

    for food in FOODS:
        cards.append(
            _card(
                f"How would you ask: Do you like to eat {food['en']}?",
                f"你喜欢吃{food['zh']}吗？",
                f"ni3 xi3 huan chi1 {food['pinyin']} ma?",
            )
        )

    for month_en, month_zh, month_py in MONTHS:
        cards.append(
            _card(
                f"How would you say: I am going to China in {month_en}.",
                f"我{month_zh}去中国。",
                f"wo3 {month_py} qu4 Zhong1 guo2.",
            )
        )

    for language in LANGUAGES:
        cards.append(
            _card(
                f"How would you ask: Is your {language['en']} good?",
                f"你的{language['zh']}好吗？",
                f"ni3 de {language['pinyin']} hao3 ma?",
            )
        )

    for owner in PEOPLE[:4]:
        for noun in rng.sample(NOUNS, 4):
            cards.append(
                _card(
                    f"How would you say: {owner['poss_en']} {noun['en']}?",
                    f"{owner['zh']}的{noun['zh']}",
                    f"{owner['pinyin']} de {noun['pinyin']}",
                    "的 marks possession or attribution.",
                )
            )

    rng.shuffle(cards)
    return _dedupe(cards)


def expand_practice(count: int, output: str, seed: int) -> None:
    ensure_project_dirs()
    cards = generate_expanded_cards(seed=seed)
    if count > 0:
        cards = cards[:count]

    lesson = {
        "lesson_id": Path(output).stem,
        "date": "generated",
        "source": "rule-based extrapolation from current lesson patterns",
        "cards": cards,
    }
    target = STRUCTURED_DIR / output
    target.write_text(json.dumps(lesson, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated {len(cards)} cards -> {target}")
