"""Build-time compatibility smoke test for Faster-Whisper and PyAV.

Creates a harmless synthetic WAV in memory; no model download or GPU required.
Run inside the actual production worker image to catch dependency regressions.
"""
import io
import wave

import av
from faster_whisper.audio import decode_audio

sample_rate = 16_000
seconds = 1

buffer = io.BytesIO()
with wave.open(buffer, "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(sample_rate)
    wav.writeframes(b"\x00\x00" * sample_rate * seconds)

buffer.seek(0)
decoded = decode_audio(buffer, sampling_rate=sample_rate)

if len(decoded) != sample_rate * seconds:
    raise RuntimeError(
        f"Unexpected decoded audio duration: got {len(decoded)} samples."
    )

print(f"Faster-Whisper audio decode OK: PyAV {av.__version__}, "
      f"{len(decoded)} samples at {sample_rate} Hz", flush=True)
