const manifestUrl = "../lessons/audio/sessions/latest/session.json";

const state = {
  manifest: null,
  index: 0,
  phase: "ready",
  running: false,
  runId: 0,
  timer: null,
  ratings: [],
  recognition: {
    available: false,
    active: false,
    instance: null,
    result: null,
    error: "",
  },
};

const els = {
  status: document.querySelector("#sessionStatus"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  phaseLabel: document.querySelector("#phaseLabel"),
  promptText: document.querySelector("#promptText"),
  answerBlock: document.querySelector("#answerBlock"),
  answerText: document.querySelector("#answerText"),
  pinyinText: document.querySelector("#pinyinText"),
  notesText: document.querySelector("#notesText"),
  timerFill: document.querySelector("#timerFill"),
  startSession: document.querySelector("#startSession"),
  playPrompt: document.querySelector("#playPrompt"),
  playAnswer: document.querySelector("#playAnswer"),
  ratingButtons: [...document.querySelectorAll("[data-rating]")],
  promptAudio: document.querySelector("#promptAudio"),
  answerAudio: document.querySelector("#answerAudio"),
  gapSeconds: document.querySelector("#gapSeconds"),
  speedPreset: document.querySelector("#speedPreset"),
  repeatAnswer: document.querySelector("#repeatAnswer"),
  commandText: document.querySelector("#commandText"),
  sessionTitle: document.querySelector("#sessionTitle"),
  sessionFile: document.querySelector("#sessionFile"),
  downloadRatings: document.querySelector("#downloadRatings"),
  pronunciationPanel: document.querySelector("#pronunciationPanel"),
  pronunciationStatus: document.querySelector("#pronunciationStatus"),
  pronunciationFeedback: document.querySelector("#pronunciationFeedback"),
  pronunciationTranscript: document.querySelector("#pronunciationTranscript"),
};

const pronunciation = window.MandarinPronunciation;
const RecognitionCtor = pronunciation?.speechRecognitionConstructor?.();
state.recognition.available = Boolean(RecognitionCtor);

function currentCard() {
  return state.manifest?.cards?.[state.index] || null;
}

function audioSrc(path) {
  return path ? `../${path}` : "";
}

function answerAudioPath(card) {
  if (!card) {
    return "";
  }
  const speed = els.speedPreset.value || "normal";
  return card.answer_audio_variants?.[speed] || card.answer_audio_path || "";
}

function setStatus(text, ready = false) {
  els.status.textContent = text;
  els.status.classList.toggle("ready", ready);
}

function recognitionLabel(status) {
  return {
    listening: "Listening",
    matched: "Matched",
    close: "Close",
    missed: "Missed",
    no_speech: "No speech",
    unsupported: "Unsupported",
    unavailable: "Unavailable",
  }[status] || "Ready";
}

function renderRecognition() {
  const result = state.recognition.result;
  const supported = state.recognition.available;
  const status = state.recognition.active ? "listening" : result?.status || (supported ? "unavailable" : "unsupported");
  els.pronunciationPanel.dataset.status = status;
  els.pronunciationStatus.textContent = supported
    ? "Pronunciation feedback"
    : "Speech recognition is not supported in this browser.";
  els.pronunciationFeedback.textContent =
    status === "unavailable" ? "Feedback will appear after you answer." : recognitionLabel(status);
  els.pronunciationTranscript.textContent = result?.transcript
    ? `Heard: ${result.transcript}`
    : result?.error
      ? `Note: ${result.error}`
      : "";
}

function render() {
  const cards = state.manifest?.cards || [];
  const card = currentCard();
  els.progressBar.max = Math.max(cards.length, 1);
  els.progressBar.value = cards.length ? state.index + 1 : 0;
  els.progressText.textContent = cards.length ? `${state.index + 1} / ${cards.length}` : "0 / 0";
  els.startSession.disabled = !cards.length;
  els.playPrompt.disabled = !card || !card.prompt_audio_path;
  els.playAnswer.disabled = !card || !answerAudioPath(card);
  els.downloadRatings.disabled = state.ratings.length === 0;

  if (!card) {
    els.phaseLabel.textContent = "Ready";
    els.promptText.textContent = "No session loaded.";
    els.answerBlock.hidden = true;
    els.timerFill.style.transform = "scaleX(0)";
    renderRecognition();
    return;
  }

  els.phaseLabel.textContent = state.phase;
  els.promptText.textContent = card.prompt_text;
  els.answerText.textContent = card.answer_text;
  els.pinyinText.textContent = card.pinyin || "";
  els.notesText.textContent = card.notes || "";
  els.answerBlock.hidden = state.phase !== "answer" && state.phase !== "rating";
  els.promptAudio.src = audioSrc(card.prompt_audio_path);
  els.answerAudio.src = audioSrc(answerAudioPath(card));
  renderRecognition();
}

async function loadManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.cards)) {
    throw new Error("Invalid session manifest");
  }
  state.manifest = manifest;
  state.index = 0;
  state.phase = "ready";
  state.running = false;
  state.ratings = [];
  resetRecognitionResult();
  els.gapSeconds.value = manifest.playback?.response_gap_seconds ?? els.gapSeconds.value;
  els.repeatAnswer.checked = Boolean(manifest.playback?.repeat_answer);
  const answerSpeeds = manifest.audio?.answer_speed_presets || [];
  const preferredSpeed = manifest.audio?.speed_preset || "normal";
  if (answerSpeeds.length) {
    els.speedPreset.innerHTML = "";
    answerSpeeds.forEach((speed) => {
      const option = document.createElement("option");
      option.value = speed;
      option.textContent = speed.charAt(0).toUpperCase() + speed.slice(1);
      els.speedPreset.append(option);
    });
  }
  els.speedPreset.value = answerSpeeds.includes(preferredSpeed) ? preferredSpeed : "normal";
  els.sessionTitle.textContent = `${manifest.session_id || "session"}/session.json`;
  updateCommand();
  setStatus(`${manifest.cards.length} cards`, true);
  render();
}

async function fetchLatestManifest() {
  try {
    const response = await fetch(manifestUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    await loadManifest(await response.json());
  } catch {
    setStatus("No session", false);
    render();
  }
}

function stopTimer() {
  window.clearInterval(state.timer);
  state.timer = null;
}

function play(audio) {
  audio.currentTime = 0;
  return audio.play();
}

function resetRecognitionResult() {
  stopRecognition();
  state.recognition.result = null;
  state.recognition.error = "";
  renderRecognition();
}

function stopRecognition() {
  if (!state.recognition.instance) {
    state.recognition.active = false;
    return;
  }
  try {
    state.recognition.instance.stop();
  } catch {
    // The browser may have already stopped the recognizer.
  }
  state.recognition.active = false;
}

function buildRecognitionResult(card, transcript, confidence = 0, error = "") {
  if (!state.recognition.available || !pronunciation) {
    return {
      status: "unsupported",
      transcript: "",
      confidence: 0,
      error: "Speech recognition is not supported in this browser.",
      expected_text: card?.answer_text || "",
      created_at: new Date().toISOString(),
    };
  }
  const comparison = pronunciation.comparePronunciation(card?.answer_text || "", transcript || "");
  return {
    ...comparison,
    transcript: transcript || "",
    confidence,
    error,
    expected_text: card?.answer_text || "",
    created_at: new Date().toISOString(),
  };
}

function startRecognition(card, runId) {
  resetRecognitionResult();
  if (!RecognitionCtor || !pronunciation) {
    state.recognition.result = buildRecognitionResult(card, "", 0, "Speech recognition is not supported in this browser.");
    renderRecognition();
    return;
  }

  const recognition = new RecognitionCtor();
  recognition.lang = "zh-CN";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 3;
  state.recognition.instance = recognition;
  state.recognition.active = true;

  recognition.onresult = (event) => {
    if (runId !== state.runId) {
      return;
    }
    const alternatives = [...event.results]
      .flatMap((result) => [...result])
      .filter((alternative) => alternative.transcript);
    const best = alternatives.sort((a, b) => (b.confidence || 0) - (a.confidence || 0))[0];
    state.recognition.result = buildRecognitionResult(card, best?.transcript || "", best?.confidence || 0);
    renderRecognition();
  };
  recognition.onerror = (event) => {
    if (runId !== state.runId) {
      return;
    }
    state.recognition.result = buildRecognitionResult(card, "", 0, event.error || "Recognition failed.");
    state.recognition.active = false;
    renderRecognition();
  };
  recognition.onend = () => {
    if (runId !== state.runId) {
      return;
    }
    state.recognition.active = false;
    if (!state.recognition.result) {
      state.recognition.result = buildRecognitionResult(card, "", 0);
    }
    renderRecognition();
  };

  try {
    recognition.start();
    renderRecognition();
  } catch (error) {
    state.recognition.active = false;
    state.recognition.result = buildRecognitionResult(card, "", 0, error.message || "Recognition failed.");
    renderRecognition();
  }
}

async function startCard() {
  const card = currentCard();
  if (!card) {
    return;
  }
  const runId = state.runId + 1;
  state.runId = runId;
  stopTimer();
  resetRecognitionResult();
  state.phase = "prompt";
  state.running = true;
  render();
  if (card.prompt_audio_path) {
    await play(els.promptAudio).catch(() => setStatus("Audio blocked", false));
  }
  if (runId === state.runId) {
    startGap(runId);
  }
}

function startGap(runId) {
  const card = currentCard();
  state.phase = "response";
  render();
  startRecognition(card, runId);
  const total = Math.max(Number(els.gapSeconds.value) || 0, 0);
  const started = Date.now();
  if (total === 0) {
    showAnswer(runId);
    return;
  }
  els.timerFill.style.transform = "scaleX(1)";
  stopTimer();
  state.timer = window.setInterval(() => {
    if (runId !== state.runId) {
      stopTimer();
      return;
    }
    const elapsed = (Date.now() - started) / 1000;
    const remaining = Math.max(1 - elapsed / total, 0);
    els.timerFill.style.transform = `scaleX(${remaining})`;
    if (remaining <= 0) {
      stopTimer();
      showAnswer(runId);
    }
  }, 100);
}

async function showAnswer(runId = state.runId + 1) {
  const card = currentCard();
  if (!card) {
    return;
  }
  state.runId = runId;
  stopRecognition();
  state.phase = "answer";
  els.timerFill.style.transform = "scaleX(0)";
  render();
  if (card.answer_audio_path) {
    await play(els.answerAudio).catch(() => setStatus("Audio blocked", false));
    if (runId !== state.runId) {
      return;
    }
    if (els.repeatAnswer.checked) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      if (runId !== state.runId) {
        return;
      }
      await play(els.answerAudio).catch(() => setStatus("Audio blocked", false));
    }
  }
  if (runId !== state.runId) {
    return;
  }
  state.phase = "rating";
  render();
}

function rateCard(rating) {
  const card = currentCard();
  if (!card) {
    return;
  }
  state.ratings.push({
    card_id: card.card_id,
    lesson_id: card.lesson_id,
    rating,
    recognition: state.recognition.result,
    prompt_text: card.prompt_text,
    answer_text: card.answer_text,
    rated_at: new Date().toISOString(),
  });
  state.runId += 1;
  if (state.index < state.manifest.cards.length - 1) {
    state.index += 1;
    startCard();
    return;
  }
  state.phase = "done";
  state.running = false;
  setStatus("Complete", true);
  render();
}

function downloadRatings() {
  const payload = {
    version: 1,
    session_id: state.manifest?.session_id || "",
    result_type: "session_ratings",
    ratings: state.ratings,
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${payload.session_id || "session"}-ratings.json`;
  link.click();
  URL.revokeObjectURL(url);
}

els.startSession.addEventListener("click", startCard);
els.playPrompt.addEventListener("click", () => play(els.promptAudio));
els.playAnswer.addEventListener("click", showAnswer);
els.ratingButtons.forEach((button) => {
  button.addEventListener("click", () => rateCard(button.dataset.rating));
});
els.downloadRatings.addEventListener("click", downloadRatings);
els.gapSeconds.addEventListener("input", () => {
  updateCommand();
});
els.speedPreset.addEventListener("change", () => {
  render();
  updateCommand();
});
function updateCommand() {
  els.commandText.textContent = `uv run --extra edge mandarin session build --latest --limit 10 --speed ${els.speedPreset.value || "normal"} --response-gap ${els.gapSeconds.value || 0}`;
}
els.sessionFile.addEventListener("change", async () => {
  const file = els.sessionFile.files[0];
  if (!file) {
    return;
  }
  await loadManifest(JSON.parse(await file.text()));
});

updateCommand();
fetchLatestManifest();
