"""Content API: seed a tiny corpus, then assert GET /v1/content returns the exact
envelope deck.ts expects."""

import asyncio

from fastapi.testclient import TestClient

from app.db import get_sessionmaker, init_models
from app.main import app
from app.seed import seed_payload

SAMPLE = {
    "card_count": 2,
    "lesson_count": 1,
    "audio": {"voice": "zh-CN-XiaoxiaoNeural", "base_url": "https://x/v1/audio"},
    "units": [
        {
            "id": "hsk1",
            "title": "HSK 1",
            "level": "1",
            "order": 1,
            "lessons": [{"id": "L1", "title": "Words 1", "order": 1, "cardCount": 2}],
        }
    ],
    "cards": [
        {"id": "c1", "lessonId": "L1", "promptEn": "to love", "answerZh": "爱", "pinyin": "ai4"},
        {"id": "c2", "lessonId": "L1", "promptEn": "eight", "answerZh": "八", "pinyin": "ba1"},
    ],
}


def _seed():
    async def run():
        await init_models()
        async with get_sessionmaker()() as session:
            await seed_payload(session, SAMPLE)

    asyncio.run(run())


def test_content_envelope():
    _seed()
    with TestClient(app) as client:
        r = client.get("/v1/content")
    assert r.status_code == 200
    body = r.json()
    assert body["card_count"] == 2
    assert body["lesson_count"] == 1
    assert body["audio"]["voice"] == "zh-CN-XiaoxiaoNeural"
    assert [u["id"] for u in body["units"]] == ["hsk1"]
    assert body["units"][0]["lessons"][0]["id"] == "L1"
    ids = {c["id"] for c in body["cards"]}
    assert ids == {"c1", "c2"}
    # every card keeps the minimum fields deck.ts filters on
    for c in body["cards"]:
        assert c["promptEn"] and c["answerZh"] and c["pinyin"]
