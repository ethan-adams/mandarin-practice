"""Server-side Mandarin tone assessment: a real F0 tracker, not the browser's.

The in-browser detector this replaces used a single-pass autocorrelation that
octave-errors on many voices and "reads most tones as falling" (see the client's
mandarinToneAssessment.ts KNOWN LIMITATION). Here we run **YIN** (de Cheveigne &
Kawahara, 2002): its cumulative-mean-normalized difference function plus an
absolute threshold is far more octave-robust than plain autocorrelation, and a
median smoother mops up the stray jumps YIN still makes. Pure NumPy only, so the
2 GB box needs no scipy/librosa/numba (see VISION.md).

Flow: decoded mono samples + the card's expected tone sequence ->
  1. YIN F0 track over the clip,
  2. trim to the voiced span,
  3. split that span into one window per expected syllable
     (from Whisper word timings when they line up, else even time),
  4. classify each window's pitch shape and compare to the expected tone.

The output is honest per-syllable evidence, framed as an estimate. It never
invents a verdict when there isn't enough voiced audio to judge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

import numpy as np

# --- Tunables -------------------------------------------------------------------
# Human speech, deliberately tighter than the client's 70-500 Hz: a narrower band
# is itself an octave-error guard (a learner mic rarely carries a real 450 Hz F0).
F0_MIN_HZ = 70.0
F0_MAX_HZ = 400.0
FRAME_MS = 40.0
HOP_MS = 10.0
YIN_THRESHOLD = 0.15  # canonical YIN absolute threshold
# When no tau clears the strict threshold, still accept the global CMND minimum if
# it is this periodic. Recovers the low, half-creaky trough of an isolated tone 3
# that a strict 0.15 gate drops entirely (leaving the dip as a voicing hole).
YIN_FALLBACK_MAX = 0.35
# A frame counts as voiced only when YIN found a clear period AND there is real
# energy there. RMS floor is on peak-normalized audio, so it is gain-independent.
RMS_FLOOR = 0.03
# Bridge short unvoiced gaps INSIDE a syllable (a creaky trough, a stop closure)
# up to this many frames, so a tone-3 dip stays one contour instead of splitting.
MAX_GAP_FRAMES = 7
MIN_VOICED_FRAMES = 6  # below this we decline to judge (honest "not enough audio")

Observed = Literal["level", "rising", "dipping", "falling", "unvoiced"]
SyllableStatus = Literal["matched", "close", "missed", "unscored"]
OverallStatus = Literal["matched", "close", "missed", "no_speech"]


@dataclass
class SyllableVerdict:
    expected_tone: int  # 1-4, or 5 for neutral
    observed: Observed
    status: SyllableStatus
    confidence: float  # 0..1, how much voiced evidence backed this syllable
    start_hz: Optional[float] = None
    end_hz: Optional[float] = None

    def as_dict(self) -> dict:
        return {
            "expected": self.expected_tone,
            "observed": self.observed,
            "status": self.status,
            "confidence": round(self.confidence, 3),
            "startHz": None if self.start_hz is None else round(self.start_hz, 1),
            "endHz": None if self.end_hz is None else round(self.end_hz, 1),
        }


# Overall pitch contour length; MUST match the client's CONTOUR_POINTS so the
# learner contour and the native reference contour compare point-for-point.
CONTOUR_POINTS = 24


@dataclass
class ToneAssessment:
    status: OverallStatus
    confidence: float  # 0..1 overall, min of the graded syllables' confidence
    voiced_frames: int
    segmentation: Literal["whisper", "even", "none"]
    syllables: list[SyllableVerdict] = field(default_factory=list)
    # The learner's pitch contour: semitones vs. their own median, resampled to
    # CONTOUR_POINTS. This is the PRIMARY tone signal - the client correlates it
    # against the native reference clip's contour (which cancels the shared
    # isolated-syllable prosody that defeats absolute tone-shape rules). Empty
    # when there was not enough voiced audio.
    contour: list[float] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "status": self.status,
            "confidence": round(self.confidence, 3),
            "voicedFrames": self.voiced_frames,
            "segmentation": self.segmentation,
            "syllables": [s.as_dict() for s in self.syllables],
            "contour": [round(v, 3) for v in self.contour],
        }

    def has_verdict(self) -> bool:
        """True only when we actually compared contours for a graded syllable."""
        return self.status in ("matched", "close", "missed") and any(
            s.expected_tone not in (0, 5) and s.status != "unscored" for s in self.syllables
        )


# --- F0 tracking (YIN) ----------------------------------------------------------
def _difference_function(frame: np.ndarray, tau_max: int) -> np.ndarray:
    """YIN difference function d(tau) via the autocorrelation identity, so it is
    O(n log n) per frame instead of O(n * tau_max)."""
    w = frame.size
    # Term energies: cumulative sum of squares gives sum_j x[j]^2 windows fast.
    cumsq = np.concatenate(([0.0], np.cumsum(frame * frame)))
    # Autocorrelation via FFT.
    size = 1
    while size < 2 * w:
        size *= 2
    spec = np.fft.rfft(frame, size)
    corr = np.fft.irfft(spec * np.conjugate(spec), size)[:tau_max]
    taus = np.arange(tau_max)
    # d(tau) = sum_{j<w-tau} (x[j] - x[j+tau])^2
    #        = energy[0..w-tau] + energy[tau..w] - 2*corr[tau]
    left = cumsq[w - taus] - cumsq[0]
    right = cumsq[w] - cumsq[taus]
    return left + right - 2.0 * corr


def _cumulative_mean_normalized(diff: np.ndarray) -> np.ndarray:
    cmnd = np.ones_like(diff)
    running = np.cumsum(diff[1:])
    taus = np.arange(1, diff.size)
    # Guard the divide: silent frames have running==0.
    with np.errstate(divide="ignore", invalid="ignore"):
        vals = diff[1:] * taus / running
    cmnd[1:] = np.where(running > 0, vals, 1.0)
    return cmnd


def _yin_frame(frame: np.ndarray, sr: int) -> Optional[float]:
    tau_min = max(int(sr / F0_MAX_HZ), 2)
    tau_max = min(int(sr / F0_MIN_HZ) + 1, frame.size // 2)
    if tau_max <= tau_min + 1:
        return None
    diff = _difference_function(frame, tau_max)
    cmnd = _cumulative_mean_normalized(diff)

    # First tau below the absolute threshold, walking down to the local min.
    tau = tau_min
    while tau < tau_max:
        if cmnd[tau] < YIN_THRESHOLD:
            while tau + 1 < tau_max and cmnd[tau + 1] < cmnd[tau]:
                tau += 1
            break
        tau += 1
    else:
        # Nothing cleared the strict threshold. Accept the global minimum only if
        # it is still clearly periodic (recovers creaky low troughs); otherwise
        # reject as unvoiced rather than guess an octave.
        tau = int(np.argmin(cmnd[tau_min:tau_max])) + tau_min
        if cmnd[tau] > YIN_FALLBACK_MAX:
            return None

    # Parabolic interpolation around the chosen tau for sub-sample precision.
    if 1 <= tau < tau_max - 1:
        a, b, c = cmnd[tau - 1], cmnd[tau], cmnd[tau + 1]
        denom = a + c - 2 * b
        shift = 0.5 * (a - c) / denom if denom != 0 else 0.0
        tau_interp = tau + float(np.clip(shift, -1.0, 1.0))
    else:
        tau_interp = float(tau)
    return sr / tau_interp


def _median_smooth(values: np.ndarray, kernel: int = 5) -> np.ndarray:
    """Median filter over voiced values (NaN = unvoiced), NaN-preserving. Kills
    the occasional YIN octave jump without smearing tone movement."""
    n = values.size
    out = values.copy()
    half = kernel // 2
    for i in range(n):
        if np.isnan(values[i]):
            continue
        lo, hi = max(0, i - half), min(n, i + half + 1)
        window = values[lo:hi]
        window = window[~np.isnan(window)]
        if window.size:
            out[i] = float(np.median(window))
    return out


def track_f0(samples: np.ndarray, sr: int) -> tuple[np.ndarray, np.ndarray]:
    """Return (times, f0_hz) with NaN where unvoiced. Audio is peak-normalized so
    the RMS voicing gate is independent of mic gain."""
    samples = np.asarray(samples, dtype=np.float64)
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak > 0:
        samples = samples / peak

    frame_len = int(sr * FRAME_MS / 1000.0)
    hop = int(sr * HOP_MS / 1000.0)
    if samples.size < frame_len:
        return np.zeros(0), np.zeros(0)

    times: list[float] = []
    f0: list[float] = []
    window = np.hanning(frame_len)
    for start in range(0, samples.size - frame_len + 1, hop):
        frame = samples[start : start + frame_len]
        rms = float(np.sqrt(np.mean(frame * frame)))
        t = (start + frame_len / 2) / sr
        times.append(t)
        if rms < RMS_FLOOR:
            f0.append(np.nan)
            continue
        pitch = _yin_frame(frame * window, sr)
        f0.append(pitch if pitch and F0_MIN_HZ <= pitch <= F0_MAX_HZ else np.nan)

    return np.array(times), _bridge_gaps(_median_smooth(np.array(f0)))


def _bridge_gaps(f0: np.ndarray, max_gap: int = MAX_GAP_FRAMES) -> np.ndarray:
    """Linearly interpolate (in log-Hz) short unvoiced gaps BETWEEN voiced runs,
    leaving the leading/trailing unvoiced edges as NaN. A creaky tone-3 trough
    reads as one dipping contour instead of two fragments."""
    out = f0.copy()
    voiced = np.where(~np.isnan(f0))[0]
    if voiced.size < 2:
        return out
    for a, b in zip(voiced[:-1], voiced[1:]):
        gap = b - a - 1
        if 0 < gap <= max_gap:
            lo, hi = np.log(f0[a]), np.log(f0[b])
            for k in range(1, gap + 1):
                out[a + k] = float(np.exp(lo + (hi - lo) * k / (gap + 1)))
    return out


# --- Segmentation ---------------------------------------------------------------
def _voiced_span(times: np.ndarray, f0: np.ndarray) -> Optional[tuple[float, float]]:
    voiced = ~np.isnan(f0)
    if voiced.sum() < MIN_VOICED_FRAMES:
        return None
    idx = np.where(voiced)[0]
    return float(times[idx[0]]), float(times[idx[-1]])


def voiced_islands(times: np.ndarray, f0: np.ndarray, min_len_frames: int = 3) -> list[tuple[float, float]]:
    """Contiguous voiced runs as (start, end) time windows. `track_f0` already
    bridged sub-70ms gaps, so runs split only at real unvoiced gaps (consonant
    closures) — i.e. roughly at syllable boundaries, and each run is a syllable's
    tonal rhyme. No whisper needed; this is where the tone actually lives."""
    voiced = ~np.isnan(f0)
    islands: list[tuple[float, float]] = []
    i, n = 0, len(f0)
    while i < n:
        if not voiced[i]:
            i += 1
            continue
        j = i
        while j < n and voiced[j]:
            j += 1
        if j - i >= min_len_frames:
            islands.append((float(times[i]), float(times[j - 1])))
        i = j
    return islands


def segment_by_energy(samples: np.ndarray, sr: int, n: int) -> list[tuple[float, float]]:
    """Split the active (loud) span into exactly `n` syllable windows at the n-1
    deepest energy valleys (consonant onsets between syllables); falls back to an
    equal-time split when there aren't enough clear valleys. Whisper-free — used
    to cut per-syllable training/eval segments from connected speech. Feature
    extraction reads voiced frames within each window, so boundary slop is soft."""
    samples = np.asarray(samples, dtype=np.float64)
    hop = max(1, int(sr * 0.01))
    flen = max(hop, int(sr * 0.025))
    if samples.size < flen or n < 1:
        return []
    starts = np.arange(0, samples.size - flen + 1, hop)
    rms = np.array([float(np.sqrt(np.mean(samples[s : s + flen] ** 2))) for s in starts])
    t = (starts + flen / 2) / sr
    kernel = np.ones(5) / 5
    smooth = np.convolve(rms, kernel, mode="same")
    peak = float(smooth.max()) or 1.0
    active = np.where(smooth > 0.18 * peak)[0]
    if active.size < n or (active[-1] - active[0]) < n:
        return []
    lo, hi = int(active[0]), int(active[-1])
    if n == 1:
        return [(float(t[lo]), float(t[hi]))]

    candidates = [j for j in range(lo + 1, hi) if smooth[j] <= smooth[j - 1] and smooth[j] <= smooth[j + 1]]
    bounds: list[int]
    if len(candidates) >= n - 1:
        candidates.sort(key=lambda j: smooth[j])  # deepest valleys first
        chosen: list[int] = []
        min_sep = max(3, (hi - lo) // (n * 2))
        for j in candidates:
            if all(abs(j - c) >= min_sep for c in chosen):
                chosen.append(j)
            if len(chosen) == n - 1:
                break
        bounds = sorted([lo, *chosen, hi]) if len(chosen) == n - 1 else list(np.linspace(lo, hi, n + 1).astype(int))
    else:
        bounds = list(np.linspace(lo, hi, n + 1).astype(int))
    return [(float(t[bounds[k]]), float(t[bounds[k + 1]])) for k in range(n)]


def _syllable_windows(
    times: np.ndarray,
    f0: np.ndarray,
    n: int,
    word_spans: Optional[list[tuple[float, float]]],
) -> tuple[list[tuple[float, float]], str]:
    """One (start,end) time window per expected syllable. Prefer Whisper word
    timings when they resolve to exactly n Han-character spans; otherwise split
    the voiced span into n even windows (honest, reported as `even`)."""
    if word_spans and len(word_spans) == n:
        return word_spans, "whisper"
    span = _voiced_span(times, f0)
    if span is None:
        return [], "none"
    start, end = span
    step = (end - start) / n
    return [(start + i * step, start + (i + 1) * step) for i in range(n)], "even"


# --- Classification -------------------------------------------------------------
def _semitones(hz: np.ndarray, reference_hz: float) -> np.ndarray:
    return 12.0 * np.log2(hz / reference_hz)


def _observe_shape(semis: np.ndarray) -> Observed:
    """Name the pitch shape from a syllable's semitone contour (>=3 points).

    Trims the edges (consonant transitions / offsets), fits a line for the net
    slope, and measures how far the interior dips below the endpoints. Robust to
    the wobble that made the browser detector read most tones as one shape."""
    if semis.size < 3:
        return "unvoiced"
    # Drop the outer ~15% each side: onsets and release noise skew the endpoints.
    trim = max(0, int(semis.size * 0.15))
    core = semis[trim : semis.size - trim] if semis.size - 2 * trim >= 3 else semis
    n = core.size
    edge = max(1, n // 4)
    start = float(np.median(core[:edge]))
    end = float(np.median(core[-edge:]))
    # Least-squares slope over the whole core, in semitones end-to-end.
    x = np.linspace(0.0, 1.0, n)
    slope = float(np.polyfit(x, core, 1)[0])  # semitones across the syllable
    interior = core[edge : n - edge] if n - 2 * edge >= 1 else core
    lowest = float(np.min(interior))
    dip = min(start, end) - lowest  # how far the middle sags below both edges

    # Tone 3: a clear sag in the middle, OR a low-register fall-then-flatten that
    # isolated third tone is usually realized as.
    if dip > 1.2:
        return "dipping"
    if slope > 1.6:
        return "rising"
    if slope < -1.8:
        return "falling"
    return "level"


# Which observed shapes are a full match / a near-miss for each expected tone.
_TONE_SHAPES: dict[int, tuple[set[str], set[str]]] = {
    1: ({"level"}, {"falling", "rising"}),
    2: ({"rising"}, {"dipping", "level"}),
    3: ({"dipping"}, {"rising", "level"}),
    4: ({"falling"}, {"level"}),
}


def _classify(expected_tone: int, semis: np.ndarray, confidence: float) -> SyllableVerdict:
    observed = _observe_shape(semis)
    start_hz = end_hz = None
    if observed == "unvoiced" or confidence <= 0:
        return SyllableVerdict(expected_tone, observed, "unscored", confidence)
    matches, near = _TONE_SHAPES.get(expected_tone, (set(), set()))
    if observed in matches:
        status: SyllableStatus = "matched"
    elif observed in near:
        status = "close"
    else:
        status = "missed"
    return SyllableVerdict(expected_tone, observed, status, confidence, start_hz, end_hz)


def _classify_syllable(expected_tone: int, seg_hz: np.ndarray, reference: float, confidence: float) -> SyllableVerdict:
    """Classify one syllable's tone. Uses the trained model when present; falls
    back to the DSP shape rules otherwise (so the service works before Phase B's
    weights are committed, and if the model file is ever missing)."""
    from .tone_model import TONE_SHAPE_NAME, get_tone_model, tone_features

    model = get_tone_model()
    if model is not None:
        feats = tone_features(seg_hz, reference)
        if feats is not None:
            predicted = model.predict(feats)
            observed = TONE_SHAPE_NAME.get(predicted, "level")
            status: SyllableStatus = "matched" if predicted == expected_tone else "missed"
            return SyllableVerdict(expected_tone, observed, status, confidence)  # type: ignore[arg-type]
    return _classify(expected_tone, _semitones(seg_hz, reference), confidence)


def assess_tones(
    samples: np.ndarray,
    sr: int,
    expected_tones: list[int],
    word_spans: Optional[list[tuple[float, float]]] = None,
) -> ToneAssessment:
    """Full assessment: F0 track -> per-syllable windows -> per-tone verdicts.

    `expected_tones` is the card's tone sequence (1-4, 5=neutral). Neutral
    syllables are always 'matched' (no contour to compare)."""
    times, f0 = track_f0(samples, sr)
    voiced_total = int((~np.isnan(f0)).sum())
    n = len(expected_tones)
    if n == 0 or voiced_total < MIN_VOICED_FRAMES:
        return ToneAssessment("no_speech", 0.0, voiced_total, "none", [])

    windows, seg = _syllable_windows(times, f0, n, word_spans)
    if not windows:
        return ToneAssessment("no_speech", 0.0, voiced_total, "none", [])

    # Reference pitch = median over all voiced frames, so a syllable's height
    # (tone 1 is *high* level) is meaningful, and the whole thing is
    # speaker/gender/gain independent.
    voiced_hz = f0[~np.isnan(f0)]
    reference = float(np.median(voiced_hz))
    contour = _overall_contour(f0, reference)

    verdicts: list[SyllableVerdict] = []
    for tone, (w_start, w_end) in zip(expected_tones, windows):
        mask = (times >= w_start) & (times <= w_end) & ~np.isnan(f0)
        seg_hz = f0[mask]
        if tone == 5 or tone == 0:
            verdicts.append(SyllableVerdict(tone, "level", "matched", 1.0))
            continue
        confidence = float(min(1.0, seg_hz.size / 6.0))
        if seg_hz.size < 3:
            verdicts.append(SyllableVerdict(tone, "unvoiced", "unscored", confidence))
            continue
        verdict = _classify_syllable(tone, seg_hz, reference, confidence)
        verdict.start_hz = float(seg_hz[0])
        verdict.end_hz = float(seg_hz[-1])
        verdicts.append(verdict)

    graded = [v for v in verdicts if v.expected_tone not in (0, 5) and v.status != "unscored"]
    if not graded:
        # Either an all-neutral phrase (nothing to compare - benignly "matched",
        # no contour verdict) or a graded phrase we couldn't voice (no_speech).
        neutral_only = all(v.expected_tone in (0, 5) for v in verdicts)
        return ToneAssessment("matched" if neutral_only else "no_speech", 0.0, voiced_total, seg, verdicts, contour)

    rank = {"matched": 1.0, "close": 0.5, "missed": 0.0}
    mean_score = sum(rank[v.status] for v in graded) / len(graded)
    overall: OverallStatus = "matched" if mean_score >= 0.75 else "close" if mean_score >= 0.4 else "missed"
    confidence = min(v.confidence for v in graded)
    return ToneAssessment(overall, confidence, voiced_total, seg, verdicts, contour)


def _overall_contour(f0: np.ndarray, reference: float) -> list[float]:
    """The whole utterance's voiced pitch as semitones vs. `reference`, resampled
    to CONTOUR_POINTS - matched point-for-point to the native reference contours
    the client compares against (public/mandarin-contours.json)."""
    voiced = f0[~np.isnan(f0)]
    if voiced.size < 3 or reference <= 0:
        return []
    semis = 12.0 * np.log2(voiced / reference)
    xs = np.linspace(0, semis.size - 1, CONTOUR_POINTS)
    return [float(v) for v in np.interp(xs, np.arange(semis.size), semis)]
