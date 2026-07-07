(function (root) {
  const variantMap = new Map(
    Object.entries({
      妳: "你",
      祢: "你",
      嗎: "吗",
      麼: "么",
      麽: "么",
      甚: "什",
      裏: "里",
      裡: "里",
      喫: "吃",
      說: "说",
      誰: "谁",
      這: "这",
      那兒: "那儿",
      哪兒: "哪儿",
      兒: "儿",
      們: "们",
      個: "个",
      幾: "几",
      點: "点",
      會: "会",
      想: "想",
      喝: "喝",
      茶: "茶",
    })
  );

  const punctuationPattern =
    /[\s.,!?;:'"()[\]{}，。！？、；：「」『』（）《》〈〉…·~`@#$%^&*_+=|\\/\\-]/gu;

  function normalizeMandarinText(text) {
    if (!text) {
      return "";
    }
    let normalized = String(text).normalize("NFKC").toLowerCase();
    for (const [from, to] of variantMap) {
      normalized = normalized.replaceAll(from, to);
    }
    return normalized.replace(punctuationPattern, "");
  }

  function uniqueChars(text) {
    return [...new Set([...text])];
  }

  function characterSimilarity(a, b) {
    if (!a || !b) {
      return 0;
    }
    const expectedChars = uniqueChars(a);
    const recognizedChars = new Set([...b]);
    const matched = expectedChars.filter((char) => recognizedChars.has(char)).length;
    return matched / expectedChars.length;
  }

  function comparePronunciation(expected, recognized) {
    const normalizedExpected = normalizeMandarinText(expected);
    const normalizedRecognized = normalizeMandarinText(recognized);
    if (!normalizedRecognized) {
      return {
        status: "no_speech",
        normalized_expected: normalizedExpected,
        normalized_transcript: normalizedRecognized,
        similarity: 0,
      };
    }
    if (normalizedExpected && normalizedExpected === normalizedRecognized) {
      return {
        status: "matched",
        normalized_expected: normalizedExpected,
        normalized_transcript: normalizedRecognized,
        similarity: 1,
      };
    }
    const includesExpected =
      normalizedExpected.length >= 2 &&
      (normalizedRecognized.includes(normalizedExpected) || normalizedExpected.includes(normalizedRecognized));
    const similarity = characterSimilarity(normalizedExpected, normalizedRecognized);
    const status = includesExpected || similarity >= 0.6 ? "close" : "missed";
    return {
      status,
      normalized_expected: normalizedExpected,
      normalized_transcript: normalizedRecognized,
      similarity: Number(similarity.toFixed(3)),
    };
  }

  function speechRecognitionConstructor() {
    return root.SpeechRecognition || root.webkitSpeechRecognition || null;
  }

  root.MandarinPronunciation = {
    comparePronunciation,
    normalizeMandarinText,
    speechRecognitionConstructor,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
