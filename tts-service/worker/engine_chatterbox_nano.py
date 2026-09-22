from __future__ import annotations

import gc
import os
from typing import Any

import numpy as np

from .voice_store import reference_path


class Engine:
    loaded = False

    def __init__(self) -> None:
        self.model = None

    def _ensure(self) -> None:
        if self.model is not None:
            return
        import torch
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        torch.set_num_threads(max(1, int(os.getenv("TORCH_NUM_THREADS", "8"))))
        self.model = ChatterboxTurboTTS.from_pretrained(
            device="cpu",
            nano=True,
        )
        self.loaded = True

    def synthesize(self, request: Any) -> tuple[np.ndarray, int, dict[str, Any]]:
        self._ensure()
        kwargs: dict[str, Any] = {}
        if request.reference_path:
            kwargs["audio_prompt_path"] = str(
                reference_path(str(request.voice_id))
            )
        if request.temperature is not None:
            kwargs["temperature"] = float(request.temperature)

        import torch
        with torch.inference_mode():
            wav = self.model.generate(request.text, **kwargs)

        audio = np.asarray(
            wav.squeeze(0).detach().cpu().numpy(),
            dtype=np.float32,
        )
        return audio, int(self.model.sr), {
            "voice_id": request.voice_id,
            "cloned": bool(request.reference_path),
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "model": "ResembleAI/chatterbox-nano",
            "device": "cpu",
            "loaded": self.loaded,
            "voiceCloning": True,
        }

    def unload(self) -> None:
        self.model = None
        self.loaded = False
        gc.collect()
