import io
import os
from functools import lru_cache

import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from qwen_tts import Qwen3TTSModel

MODEL_ID = os.getenv(
    "QWEN3_TTS_MODEL",
    "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
)
DEVICE = os.getenv("QWEN3_TTS_DEVICE", "cuda:0")
DTYPE_NAME = os.getenv("QWEN3_TTS_DTYPE", "")
DEFAULT_VOICE = os.getenv("QWEN3_TTS_VOICE", "Ryan")
DEFAULT_LANGUAGE = os.getenv("QWEN3_TTS_LANGUAGE", "Auto")
DEFAULT_INSTRUCT = os.getenv(
    "QWEN3_TTS_VOICE_INSTRUCT",
    "Warm, clear documentary narrator. Natural pacing, confident, calm, and easy to understand.",
)
MAX_NEW_TOKENS = int(os.getenv("QWEN3_TTS_MAX_NEW_TOKENS", "4096"))

app = FastAPI(title="Helix Qwen3-TTS Fallback", version="1.0.0")


class SpeechRequest(BaseModel):
    model: str | None = None
    input: str = Field(min_length=1)
    voice: str | None = None
    language: str | None = None
    instruct: str | None = None
    response_format: str = "wav"


def resolve_dtype():
    name = DTYPE_NAME.lower()
    if name == "float16":
        return torch.float16
    if name == "float32":
        return torch.float32
    if name == "bfloat16":
        return torch.bfloat16
    return torch.float32 if DEVICE == "cpu" else torch.bfloat16


@lru_cache(maxsize=1)
def get_model():
    kwargs = {
        "device_map": DEVICE,
        "dtype": resolve_dtype(),
    }
    if DEVICE.startswith("cuda"):
        kwargs["attn_implementation"] = os.getenv("QWEN3_TTS_ATTN", "sdpa")
    return Qwen3TTSModel.from_pretrained(MODEL_ID, **kwargs)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "device": DEVICE,
        "loaded": get_model.cache_info().currsize > 0,
    }


@app.get("/v1/models")
def models():
    return {"data": [{"id": MODEL_ID, "object": "model", "owned_by": "Qwen"}], "object": "list"}


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest):
    if request.response_format.lower() != "wav":
        raise HTTPException(status_code=400, detail="The Helix fallback currently returns WAV; set response_format to 'wav'.")

    try:
        model = get_model()
        language = request.language or DEFAULT_LANGUAGE
        voice = request.voice or DEFAULT_VOICE
        instruct = request.instruct or DEFAULT_INSTRUCT

        try:
            wavs, sample_rate = model.generate_custom_voice(
                text=request.input,
                language=language,
                speaker=voice,
                instruct=instruct,
                max_new_tokens=MAX_NEW_TOKENS,
            )
        except Exception as exc:
            supported = []
            try:
                supported = list(model.get_supported_speakers())
            except Exception:
                pass
            suffix = f" Supported speakers: {', '.join(supported)}." if supported else ""
            raise RuntimeError(f"Qwen3-TTS custom voice generation failed: {exc}.{suffix}") from exc

        buffer = io.BytesIO()
        sf.write(buffer, wavs[0], sample_rate, format="WAV", subtype="PCM_16")
        return Response(content=buffer.getvalue(), media_type="audio/wav")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
