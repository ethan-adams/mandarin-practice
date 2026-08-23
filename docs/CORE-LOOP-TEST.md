# Core-loop test (needs a human + a mic)

The one thing automated tests can't cover: does the **speak → judge → trace →
story** loop actually feel good to a real learner? Run this on your **phone**
(where a stranger would use it) at https://mandarin.ethanadams.dev. ~10 minutes.

For each step: **Expected** is the pass; **Flag if** is a bug worth telling Claude.

## 0. Start clean
- Open the site, go to **You → Reset progress** (so you see the newcomer view).
- **Expected:** Explore now shows a "New here? Start here → Start <lesson>" hero
  and a three-point strip (Speak it · Trace it · See its story).
- **Flag if:** you land on a wall of cards with no guidance.

## 1. Speak → auto-judge (the core promise)
- Tap **Start <lesson>**. On the first card, tap **Speak** and allow the mic.
- Say the Mandarin answer out loud.
- **Expected:** the tone coach reacts live; after you stop, you get per-character
  feedback and a **verdict + a single Next** (the app graded you — no manual
  Again/Good/Easy).
- **Flag if:** speaking does nothing; the verdict feels clearly wrong for how you
  actually said it; or a mic problem shows no explanation.
- **Fairness probe:** do one card *well* and one card *deliberately wrong*. The
  verdict should track reality, not always say the same thing.

## 2. Word check (optional tier)
- In the tone-coach panel, tap **Enable word check**, then speak again.
- **Expected:** it reads back what you said and marks the characters. Copy should
  say the clip goes to the server and is discarded — **not** "runs on your device."
- **Flag if:** it hangs, the transcript is wrong, or the privacy copy is off.

## 3. Trace (first-class, touch)
- After revealing, tap **Trace it** and write the character with your finger.
- **Expected:** a big canvas; your finger draws (the page doesn't scroll under it);
  strokes register and it advances character by character.
- **Flag if:** the canvas is tiny, the page scrolls while you draw, or strokes
  don't take.

## 4. Character Story (the motivator)
- Tap any **hanzi in a revealed answer** (or a tile in Journey).
- **Expected:** the story opens — pinyin, meaning, radical, "Built from"
  components, "Where it comes from", and for common characters **"How it evolved"**
  (oracle → bronze → seal → today). Tap **Trace this character** to write it.
- **Flag if:** layout breaks, the breakdown looks wrong, or the ancient glyphs are
  invisible/misrendered. (Rare characters simply won't have an evolution — that's
  expected, not a bug.)

## 5. Journey
- Top nav → **Journey**.
- **Expected:** "characters met / sticking well" reflects what you just practiced;
  no due-date guilt; tapping a character opens its story.
- **Flag if:** the counts look wrong, or due dates/streak pressure appear.

## 6. Festival greeting
- On Explore, the **festival card** (Mid-Autumn right now). Tap **▶** by the
  greeting.
- **Expected:** it speaks 中秋快乐 in Mandarin (only shows ▶ if your phone has a
  Mandarin voice).
- **Flag if:** ▶ shows but is silent.

## 7. Accounts / cross-device
- **You → Create account**, then sign out and back in.
- **Expected:** your progress is still there. Bonus: sign in on a second device and
  confirm it follows you.
- **Flag if:** progress is lost or doesn't sync.

---

**The bar (Ethan):** after this run, would a stranger genuinely keep going? Note
anything that felt confusing, unfair, or janky — those are the next fixes, more
than any new feature.
