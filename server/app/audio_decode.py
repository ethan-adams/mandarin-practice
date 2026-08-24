"""Decode a recorded clip (webm/opus, ogg, wav, ...) to mono float32 PCM.

PyAV (`av`) is the only media dep on the box - no soundfile/librosa (see VISION.md
for why those stay off the 2 GB box). Import is lazy so the module loads in tests
and local dev where av isn't installed; only a real decode needs it.
"""

from __future__ import annotations

import io

import numpy as np

TARGET_SR = 16_000  # plenty for F0 <= 400 Hz; matches Whisper's rate


def decode_to_mono(data: bytes, target_sr: int = TARGET_SR) -> tuple[np.ndarray, int]:
    """Return (samples float32 in [-1,1], sample_rate). Resamples to target_sr
    mono. Raises on undecodable input."""
    import av  # heavy; lazy

    with av.open(io.BytesIO(data)) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise ValueError("no audio stream in clip")
        resampler = av.audio.resampler.AudioResampler(format="flt", layout="mono", rate=target_sr)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                arr = resampled.to_ndarray()  # shape (1, n) for mono flt
                chunks.append(arr.reshape(-1))
        # Flush the resampler's tail.
        for resampled in resampler.resample(None):
            arr = resampled.to_ndarray()
            chunks.append(arr.reshape(-1))

    if not chunks:
        return np.zeros(0, dtype=np.float32), target_sr
    return np.concatenate(chunks).astype(np.float32), target_sr
