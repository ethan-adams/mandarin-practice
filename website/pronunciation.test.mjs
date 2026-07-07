import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("./pronunciation.js", import.meta.url), "utf8");
const context = { console };
vm.createContext(context);
vm.runInContext(source, context);

const { comparePronunciation, normalizeMandarinText } = context.MandarinPronunciation;

test("normalizes punctuation, whitespace, and simple variants", () => {
  assert.equal(normalizeMandarinText("妳 喝 茶嗎？"), "你喝茶吗");
});

test("exact normalized transcript is matched", () => {
  const result = comparePronunciation("我喝茶。", "我 喝 茶");
  assert.equal(result.status, "matched");
  assert.equal(result.similarity, 1);
});

test("partial overlapping Mandarin is close", () => {
  const result = comparePronunciation("你想喝什么？", "想喝什么");
  assert.equal(result.status, "close");
});

test("empty transcript is no speech", () => {
  const result = comparePronunciation("我喝茶。", "");
  assert.equal(result.status, "no_speech");
});

test("unrelated transcript is missed", () => {
  const result = comparePronunciation("我喝茶。", "今天下雨");
  assert.equal(result.status, "missed");
});
