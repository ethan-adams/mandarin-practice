# Mandarin Practice

A browser tool for practicing spoken Mandarin. It shows you an English prompt,
you say the Chinese out loud, then reveal the answer and rate how you did. Cards
come back on a spaced-repetition schedule, so the ones you miss show up more
often and the ones you know fade into the background.

![Mandarin Practice](docs/hero.png)
<!-- TODO: add a real screenshot at docs/hero.png -->

## What it does

- **Call-and-response cards.** Prompt in English, answer in Chinese, reveal, and
  self-rate (again / hard / correct). Ratings drive the review schedule.
- **Spaced repetition.** A lightweight scheduler tracks each card and surfaces
  what is due, keeping sessions to a manageable batch with an honest summary at
  the end (cards done, accuracy, day streak, what is due next).
- **Listening practice.** Minimal-pair drills that play a cue and ask you to
  pick what you heard, to sharpen the sounds that are easy to confuse.
- **Audio.** The answer is spoken aloud so you can check yourself. Playback
  prefers a neural voice when one is available and falls back to your browser's
  built-in Chinese voice, so there is always something to listen to.
- **Tone and pronunciation feedback.** Speak into your microphone and the tool
  runs in-browser speech recognition and a pitch-based tone check. Tone feedback
  is clearly marked experimental: it is guidance, not a grade, and your own
  self-rating stays the primary signal.

## Run it locally

Requires Node 20+.

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Other scripts:

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
npm test          # run the unit and component tests (Vitest)
npm run check     # type-check with svelte-check
```

## How it is built

- Plain **Svelte 5 + Vite + TypeScript**. No backend, no accounts, no tracking.
  Everything runs in your browser, and review history is kept in local storage.
- **Ships with a small sample deck.** The app is designed to load a larger card
  set from `/mandarin-source.json` if one is present, and otherwise falls back
  to a built-in demo deck so it works out of the box. This public build has no
  source file, so it runs on the sample deck. A short banner notes when the
  fallback deck is in use.
- **Audio is client-side and free.** Answer audio uses your browser's speech
  synthesis by default. When the device supports it, a neural voice model
  ([Kokoro-82M](https://huggingface.co/onnx-community/Kokoro-82M-v1.1-zh-ONNX))
  is fetched from Hugging Face and run on-device with
  [onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web); if that is
  unavailable, playback falls back to the browser voice. Nothing is sent to a
  server for synthesis.
- **Tone feedback is best-effort.** It relies on the Web Speech API and an
  in-browser pitch detector, both of which vary by browser and device. When they
  are not available the rest of the app still works.

## License

MIT. See [LICENSE](LICENSE).
