const state = {
  backend: "edge",
  voice: "zh-CN-XiaoxiaoNeural",
};

const backendButtons = [...document.querySelectorAll("[data-backend]")];
const voiceButtons = [...document.querySelectorAll("[data-voice]")];
const commandText = document.querySelector("#commandText");
const backendStatus = document.querySelector("#backendStatus");
const rate = document.querySelector("#rate");
const rateValue = document.querySelector("#rateValue");
const limit = document.querySelector("#limit");
const voiceRotation = document.querySelector("#voiceRotation");
const fallback = document.querySelector("#fallback");
const audio = document.querySelector("#answerAudio");
const audioStatus = document.querySelector("#audioStatus");
const cacheCount = document.querySelector("#cacheCount");
const meter = document.querySelector(".meter");
const playButtons = [document.querySelector("#playAnswer"), document.querySelector("#playHero")];
const copyCommand = document.querySelector("#copyCommand");
let sampleAudioReady = false;

function command() {
  const parts = ["uv run"];
  if (state.backend === "edge") {
    parts.push("--extra edge");
  }
  parts.push("mandarin speak");
  parts.push(`--tts-backend ${state.backend}`);
  parts.push(`--mandarin-rate ${rate.value}`);
  parts.push(`--limit ${limit.value || 10}`);
  if (state.backend === "edge" && !voiceRotation.checked) {
    parts.push(`--edge-voice ${state.voice}`);
  }
  if (!voiceRotation.checked) {
    parts.push("--single-voice");
  }
  if (!fallback.checked && state.backend !== "say") {
    parts.push("# fallback disabled in UI only");
  }
  return parts.join(" ");
}

function render() {
  backendButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.backend === state.backend);
  });
  voiceButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.voice === state.voice);
  });

  rateValue.textContent = rate.value;
  commandText.textContent = command();

  if (state.backend === "edge") {
    backendStatus.textContent = "Edge ready";
    backendStatus.classList.add("ready");
  } else if (state.backend === "azure") {
    backendStatus.textContent = "Fallback";
    backendStatus.classList.remove("ready");
  } else {
    backendStatus.textContent = "Local";
    backendStatus.classList.add("ready");
  }
}

async function playAnswer() {
  if (!sampleAudioReady) {
    backendStatus.textContent = "No local audio";
    backendStatus.classList.remove("ready");
    return;
  }

  try {
    audio.currentTime = 0;
    await audio.play();
  } catch {
    backendStatus.textContent = "Audio blocked";
    backendStatus.classList.remove("ready");
  }
}

function setSampleAudioReady(isReady) {
  sampleAudioReady = isReady;
  cacheCount.textContent = isReady ? "1" : "0";
  audioStatus.textContent = isReady
    ? "Local cached answer audio is available for this sample."
    : "Generate Edge audio locally to enable the sample player.";
  playButtons.forEach((button) => {
    button.disabled = !isReady;
    button.setAttribute("aria-disabled", String(!isReady));
  });
}

backendButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.backend = button.dataset.backend;
    render();
  });
});

voiceButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.voice = button.dataset.voice;
    voiceRotation.checked = false;
    render();
  });
});

[rate, limit, voiceRotation, fallback].forEach((input) => {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

playButtons.forEach((button) => button.addEventListener("click", playAnswer));

audio.addEventListener("play", () => meter.classList.add("playing"));
audio.addEventListener("pause", () => meter.classList.remove("playing"));
audio.addEventListener("ended", () => meter.classList.remove("playing"));
audio.addEventListener("loadedmetadata", () => setSampleAudioReady(true), { once: true });
audio.addEventListener("error", () => setSampleAudioReady(false), { once: true });

copyCommand.addEventListener("click", async () => {
  await navigator.clipboard.writeText(commandText.textContent);
  copyCommand.textContent = "Copied";
  setTimeout(() => {
    copyCommand.textContent = "Copy Edge Command";
  }, 1400);
});

setSampleAudioReady(false);
render();
