from __future__ import annotations

import gc
import os
from typing import Any

import numpy as np


class Engine:
    loaded = False

    def __init__(self) -> None:
        self.pipeline = None
        self.lang_code: str | None = None
        self.default_voice = os.getenv("KOKORO_DEFAULT_VOICE", "af_heart")
        self.default_lang = os.getenv("KOKORO_LANG_CODE", "a")

    def _ensure(self, lang_code: str) -> None:
        if self.pipeline is not None and self.lang_code == lang_code:
            return
        if self.pipeline is not None:
            self.unload()
        from kokoro import KPipeline
        self.pipeline = KPipeline(lang_code=lang_code)
        self.lang_code = lang_code
        self.loaded = True

    def _lang_for_voice(self, voice: str, language: str | None) -> str:
        if language:
            normalized = language.lower()
            mapping = {
                "english": "a",
                "american english": "a",
                "british english": "b",
                "spanish": "e",
                "french": "f",
                "hindi": "h",
                "italian": "i",
                "japanese": "j",
                "portuguese": "p",
                "chinese": "z",
            }
            if normalized in mapping:
                return mapping[normalized]
        prefix = voice[:1].lower()
        return (
            prefix
            if prefix in {"a", "b", "e", "f", "h", "i", "j", "p", "z"}
            else self.default_lang
        )

    def synthesize(self, request: Any) -> tuple[np.ndarray, int, dict[str, Any]]:
        voice = str(request.voice_id or self.default_voice)
        self._ensure(self._lang_for_voice(voice, request.language))

        chunks: list[np.ndarray] = []
        generator = self.pipeline(
            request.text,
            voice=voice,
            speed=float(request.speed),
            split_pattern=r"\\n+",
        )
        for _graphemes, _phonemes, audio in generator:
            chunks.append(np.asarray(audio, dtype=np.float32))
        if not chunks:
            raise RuntimeError("Kokoro returned no audio.")
        return np.concatenate(chunks), 24000, {
            "voice_id": voice,
            "cloned": False,
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "model": "hexgrad/Kokoro-82M",
            "device": "cpu",
            "loaded": self.loaded,
        }

    def unload(self) -> None:
        self.pipeline = None
        self.lang_code = None
        self.loaded = False
        gc.collect()
