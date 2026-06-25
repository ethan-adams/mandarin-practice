const manifestUrl = "../lessons/audio/sessions/latest/session.json";

const state = {
  manifest: null,
  index: 0,
  phase: "ready",
  running: false,
  runId: 0,
  timer: null,
  ratings: [],
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
  repeatAnswer: document.querySelector("#repeatAnswer"),
  commandText: document.querySelector("#commandText"),
  sessionTitle: document.querySelector("#sessionTitle"),
  sessionFile: document.querySelector("#sessionFile"),
  downloadRatings: document.querySelector("#downloadRatings"),
};

function currentCard() {
  return state.manifest?.cards?.[state.index] || null;
}

function audioSrc(path) {
  return path ? `../${path}` : "";
}

function setStatus(text, ready = false) {
  els.status.textContent = text;
  els.status.classList.toggle("ready", ready);
}

function render() {
  const cards = state.manifest?.cards || [];
  const card = currentCard();
  els.progressBar.max = Math.max(cards.length, 1);
  els.progressBar.value = cards.length ? state.index + 1 : 0;
  els.progressText.textContent = cards.length ? `${state.index + 1} / ${cards.length}` : "0 / 0";
  els.startSession.disabled = !cards.length;
  els.playPrompt.disabled = !card || !card.prompt_audio_path;
  els.playAnswer.disabled = !card || !card.answer_audio_path;
  els.downloadRatings.disabled = state.ratings.length === 0;

  if (!card) {
    els.phaseLabel.textContent = "Ready";
    els.promptText.textContent = "No session loaded.";
    els.answerBlock.hidden = true;
    els.timerFill.style.transform = "scaleX(0)";
    return;
  }

  els.phaseLabel.textContent = state.phase;
  els.promptText.textContent = card.prompt_text;
  els.answerText.textContent = card.answer_text;
  els.pinyinText.textContent = card.pinyin || "";
  els.notesText.textContent = card.notes || "";
  els.answerBlock.hidden = state.phase !== "answer" && state.phase !== "rating";
  els.promptAudio.src = audioSrc(card.prompt_audio_path);
  els.answerAudio.src = audioSrc(card.answer_audio_path);
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
  els.gapSeconds.value = manifest.playback?.response_gap_seconds ?? els.gapSeconds.value;
  els.repeatAnswer.checked = Boolean(manifest.playback?.repeat_answer);
  els.sessionTitle.textContent = `${manifest.session_id || "session"}/session.json`;
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

async function startCard() {
  const card = currentCard();
  if (!card) {
    return;
  }
  const runId = state.runId + 1;
  state.runId = runId;
  stopTimer();
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
  state.phase = "response";
  render();
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
  els.commandText.textContent = `uv run --extra edge mandarin session build --latest --limit 10 --response-gap ${els.gapSeconds.value || 0}`;
});
els.sessionFile.addEventListener("change", async () => {
  const file = els.sessionFile.files[0];
  if (!file) {
    return;
  }
  await loadManifest(JSON.parse(await file.text()));
});

fetchLatestManifest();
