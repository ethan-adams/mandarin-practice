"""Tone engine tests: synthesize voiced signals with KNOWN F0 contours and assert
the F0 tracker + classifier recover the right tone shape. No av/whisper needed -
the DSP is fed NumPy arrays directly, so this runs in plain `pytest`.
"""

from __future__ import annotations

import numpy as np

from app.tone_engine import assess_tones, track_f0

SR = 16_000


def _synth(f0_points: list[float], seconds: float = 0.6, sr: int = SR) -> np.ndarray:
    """A vowel-like signal whose instantaneous F0 sweeps through f0_points.

    Summed harmonics (fundamental + a few overtones) with phase accumulation, so
    it is genuinely periodic at f0(t) - what a real voiced syllable looks like to
    an F0 tracker."""
    n = int(seconds * sr)
    t = np.arange(n) / sr
    # Linear-interpolate the control points across the syllable.
    f0 = np.interp(t, np.linspace(0, seconds, len(f0_points)), f0_points)
    phase = 2 * np.pi * np.cumsum(f0) / sr
    signal = np.zeros(n)
    for k, amp in enumerate([1.0, 0.5, 0.3, 0.15], start=1):
        signal += amp * np.sin(k * phase)
    # A short fade in/out to avoid edge clicks.
    fade = int(0.02 * sr)
    env = np.ones(n)
    env[:fade] = np.linspace(0, 1, fade)
    env[-fade:] = np.linspace(1, 0, fade)
    return (signal * env * 0.3).astype(np.float32)


def _silence(seconds: float = 0.6, sr: int = SR) -> np.ndarray:
    return (np.random.default_rng(0).normal(0, 1e-4, int(seconds * sr))).astype(np.float32)


def test_track_f0_recovers_steady_pitch_without_octave_error():
    samples = _synth([200.0, 200.0])
    _times, f0 = track_f0(samples, SR)
    voiced = f0[~np.isnan(f0)]
    assert voiced.size > 10
    # The whole point of moving server-side: no octave error. Median within 5%.
    assert abs(float(np.median(voiced)) - 200.0) < 10.0


def test_tone1_level_matches():
    a = assess_tones(_synth([200.0, 200.0]), SR, [1])
    assert a.status == "matched"
    assert a.syllables[0].observed == "level"


def test_tone2_rising_matches():
    a = assess_tones(_synth([150.0, 190.0, 240.0]), SR, [2])
    assert a.syllables[0].observed == "rising"
    assert a.syllables[0].status == "matched"


def test_tone3_dipping_matches():
    a = assess_tones(_synth([200.0, 135.0, 195.0]), SR, [3])
    assert a.syllables[0].observed == "dipping"
    assert a.syllables[0].status == "matched"


def test_tone4_falling_matches():
    a = assess_tones(_synth([270.0, 200.0, 150.0]), SR, [4])
    assert a.syllables[0].observed == "falling"
    assert a.syllables[0].status == "matched"


def test_falling_is_not_a_level_match():
    # Regression guard against the client detector's failure mode (everything
    # reads as one shape). A clear fall must NOT score as tone 1.
    a = assess_tones(_synth([270.0, 200.0, 150.0]), SR, [1])
    assert a.syllables[0].status != "matched"


def test_neutral_tone_always_matched():
    a = assess_tones(_synth([200.0, 200.0]), SR, [5])
    assert a.status == "matched"
    assert a.syllables[0].status == "matched"


def test_silence_is_no_speech_not_a_verdict():
    a = assess_tones(_silence(), SR, [2])
    assert a.status == "no_speech"
    assert not a.has_verdict()


def test_multisyllable_even_segmentation():
    # ni3 hao3: dip then dip. Concatenate two dipping syllables, no word spans ->
    # even split must still land both.
    samples = np.concatenate([_synth([200.0, 135.0, 195.0]), _synth([190.0, 130.0, 185.0])])
    a = assess_tones(samples, SR, [3, 3])
    assert a.segmentation == "even"
    assert len(a.syllables) == 2
    assert all(s.observed == "dipping" for s in a.syllables)
    assert a.status == "matched"


def test_returns_contour_matching_the_shape():
    # A rising syllable's returned contour must itself rise (it is the primary
    # signal the client correlates against the native reference).
    a = assess_tones(_synth([150.0, 190.0, 240.0]), SR, [2])
    assert len(a.contour) == 24
    assert a.contour[-1] > a.contour[0] + 1.0  # net rise in semitones


def test_whisper_spans_used_when_counts_match():
    samples = np.concatenate([_synth([150.0, 240.0]), _synth([270.0, 150.0])])
    spans = [(0.0, 0.6), (0.6, 1.2)]
    a = assess_tones(samples, SR, [2, 4], word_spans=spans)
    assert a.segmentation == "whisper"
    assert a.syllables[0].observed == "rising"
    assert a.syllables[1].observed == "falling"
