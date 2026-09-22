from __future__ import annotations

import base64
import importlib
import os
import threading
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .audio import wav_bytes

ENGINE = os.environ["ENGINE"]
MODULE_NAME = ENGINE.replace("-", "_").replace(".", "_")
module = importlib.import_module(f"worker.engine_{MODULE_NAME}")
engine = module.Engine()

app = FastAPI(title=f"Helix TTS Worker - {ENGINE}", version="1.0.0")
lock = threading.Lock()


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1)
    voice_id: str | None = None
    language: str | None = None
    instruct: str | None = None
    speed: float = Field(default=1.0, ge=0.25, le=3.0)
    temperature: float | None = Field(default=None, ge=0.1, le=2.0)
    reference_path: str | None = None
    reference_text: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "engine": ENGINE,
        "loaded": bool(getattr(engine, "loaded", False)),
    }


@app.get("/diagnostics")
def diagnostics() -> dict[str, Any]:
    return {"ok": True, "engine": ENGINE, **engine.diagnostics()}


@app.post("/synthesize")
def synthesize(request: SpeechRequest) -> dict[str, Any]:
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text is required.")

    try:
        with lock:
            audio, sample_rate, metadata = engine.synthesize(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    audio_array = np.asarray(audio, dtype=np.float32)
    if audio_array.ndim == 2:
        if audio_array.shape[0] == 1:
            audio_array = audio_array[0]
        elif audio_array.shape[1] == 1:
            audio_array = audio_array[:, 0]
        else:
            audio_array = audio_array.mean(axis=0)

    encoded = base64.b64encode(
        wav_bytes(audio_array, int(sample_rate))
    ).decode("ascii")
    duration = float(audio_array.shape[-1] / sample_rate)

    return {
        "audio_base64": encoded,
        "format": "wav",
        "sample_rate": int(sample_rate),
        "duration_seconds": round(duration, 3),
        "word_timestamps": [],
        "timing_method": "proportional",
        **metadata,
    }


@app.post("/unload")
def unload() -> dict[str, Any]:
    try:
        with lock:
            engine.unload()
        return {"ok": True, "engine": ENGINE, "loaded": False}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
