from __future__ import annotations

import gc
import io
import os
from typing import Any

import numpy as np


class Engine:
    loaded = False

    def __init__(self) -> None:
        self.model = None
        self.speaker_ids: dict[str, int] = {}
        self.language = os.getenv("MELO_LANGUAGE", "EN_NEWEST")
        self.default_voice = os.getenv("MELO_DEFAULT_VOICE", "EN-Newest")

    def _ensure(self) -> None:
        if self.model is not None:
            return
        from melo.api import TTS
        self.model = TTS(language=self.language, device="cpu")
        self.speaker_ids = dict(self.model.hps.data.spk2id)
        self.loaded = True

    def synthesize(self, request: Any) -> tuple[np.ndarray, int, dict[str, Any]]:
        self._ensure()
        voice = str(request.voice_id or self.default_voice)
        speaker_id = self.speaker_ids.get(voice)
        if speaker_id is None:
            raise ValueError(
                f"MeloTTS speaker '{voice}' is not available. "
                f"Available speakers: {', '.join(self.speaker_ids)}"
            )

        output = io.BytesIO()
        try:
            self.model.tts_to_file(
                request.text,
                speaker_id,
                output,
                speed=float(request.speed),
                quiet=True,
                format="wav",
            )
        except TypeError:
            output = io.BytesIO()
            self.model.tts_to_file(
                request.text,
                speaker_id,
                output,
                speed=float(request.speed),
            )

        output.seek(0)
        import soundfile as sf
        audio, sample_rate = sf.read(output, dtype="float32")
        return np.asarray(audio, dtype=np.float32), int(sample_rate), {
            "voice_id": voice,
            "cloned": False,
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "model": "myshell-ai/MeloTTS-English-v3",
            "device": "cpu",
            "language": self.language,
            "loaded": self.loaded,
        }

    def unload(self) -> None:
        self.model = None
        self.speaker_ids = {}
        self.loaded = False
        gc.collect()
