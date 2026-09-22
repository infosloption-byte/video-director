from __future__ import annotations

import gc
import os
from typing import Any

import numpy as np

from .voice_store import reference_path, reference_text


class Engine:
    loaded = False

    def __init__(self) -> None:
        self.model = None
        self.model_id = os.getenv(
            "QWEN_MODEL_ID",
            "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        )

    def _ensure(self) -> None:
        if self.model is not None:
            return
        import torch
        from qwen_tts import Qwen3TTSModel
        torch.set_num_threads(max(1, int(os.getenv("TORCH_NUM_THREADS", "8"))))
        self.model = Qwen3TTSModel.from_pretrained(
            self.model_id,
            device_map="cpu",
            dtype=torch.float32,
        )
        self.loaded = True

    def synthesize(self, request: Any) -> tuple[np.ndarray, int, dict[str, Any]]:
        if not request.voice_id or not request.reference_path:
            raise ValueError(
                "Qwen3-TTS 0.6B Base requires a voice_id with a stored reference audio."
            )
        self._ensure()

        ref_audio = str(reference_path(str(request.voice_id)))
        ref_text = request.reference_text or reference_text(str(request.voice_id))
        language = request.language or "English"
        x_vector_only_mode = not bool(ref_text)

        import torch
        with torch.inference_mode():
            wavs, sample_rate = self.model.generate_voice_clone(
                text=request.text,
                language=language,
                ref_audio=ref_audio,
                ref_text=ref_text,
                x_vector_only_mode=x_vector_only_mode,
            )
        if not wavs:
            raise RuntimeError("Qwen3-TTS returned no audio.")
        return np.asarray(wavs[0], dtype=np.float32), int(sample_rate), {
            "voice_id": request.voice_id,
            "cloned": True,
            "referenceMode": "x-vector" if x_vector_only_mode else "icl",
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "model": self.model_id,
            "device": "cpu",
            "loaded": self.loaded,
            "voiceCloning": True,
        }

    def unload(self) -> None:
        self.model = None
        self.loaded = False
        gc.collect()
