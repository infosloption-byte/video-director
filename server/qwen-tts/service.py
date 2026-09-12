import base64
import io
import os
from difflib import SequenceMatcher
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
ALIGNER_ENABLED = str(os.getenv("QWEN3_TTS_ALIGNER_ENABLED", "true")).lower() == "true"
ALIGNER_MODEL_ID = os.getenv("QWEN3_TTS_ALIGNER_MODEL", "small")
ALIGNER_DEVICE = os.getenv("QWEN3_TTS_ALIGNER_DEVICE", "cpu")
ALIGNER_COMPUTE_TYPE = os.getenv("QWEN3_TTS_ALIGNER_COMPUTE_TYPE", "int8")

app = FastAPI(title="Helix Qwen3-TTS Fallback", version="1.1.0")


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


@lru_cache(maxsize=1)
def get_aligner():
    if not ALIGNER_ENABLED:
        return None
    from faster_whisper import WhisperModel

    return WhisperModel(
        ALIGNER_MODEL_ID,
        device=ALIGNER_DEVICE,
        compute_type=ALIGNER_COMPUTE_TYPE,
    )


def normalize_token(value: str) -> str:
    return "".join(char.lower() for char in value if char.isalnum())


def language_code(language: str | None) -> str | None:
    value = str(language or "").strip().lower()
    if not value or value == "auto":
        return None
    aliases = {
        "english": "en",
        "chinese": "zh",
        "japanese": "ja",
        "korean": "ko",
        "german": "de",
        "french": "fr",
        "spanish": "es",
        "italian": "it",
        "portuguese": "pt",
        "russian": "ru",
    }
    return aliases.get(value, value.split("-")[0])


def proportional_timestamps(original_words: list[str], start: float, end: float):
    if not original_words or end <= start:
        return []
    weights = [max(1, len(normalize_token(word))) for word in original_words]
    total = sum(weights)
    cursor = start
    result = []
    for index, word in enumerate(original_words):
        next_cursor = end if index == len(original_words) - 1 else cursor + (end - start) * weights[index] / total
        result.append({"word": word, "start": round(cursor, 3), "end": round(next_cursor, 3)})
        cursor = next_cursor
    return result


def align_word_timestamps(text: str, transcript_words: list[dict], duration_seconds: float):
    original_words = str(text).strip().split()
    if not original_words:
        return []
    if not transcript_words:
        return proportional_timestamps(original_words, 0.0, duration_seconds)

    original_tokens = [normalize_token(word) for word in original_words]
    transcript_tokens = [normalize_token(word["word"]) for word in transcript_words]
    result: list[dict | None] = [None] * len(original_words)

    matcher = SequenceMatcher(None, original_tokens, transcript_tokens, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(i2 - i1):
                source = transcript_words[j1 + offset]
                result[i1 + offset] = {
                    "word": original_words[i1 + offset],
                    "start": round(float(source["start"]), 3),
                    "end": round(float(source["end"]), 3),
                }
            continue

        if i1 == i2:
            continue

        span_start = float(transcript_words[j1]["start"]) if j1 < len(transcript_words) else None
        span_end = float(transcript_words[j2 - 1]["end"]) if j2 > j1 else None
        previous = next((item for item in reversed(result[:i1]) if item), None)
        following = next((item for item in result[i2:] if item), None)
        if span_start is None:
            span_start = float(previous["end"]) if previous else 0.0
        if span_end is None:
            span_end = float(following["start"]) if following else duration_seconds
        if span_end < span_start:
            span_end = span_start
        replacement = proportional_timestamps(original_words[i1:i2], span_start, span_end)
        result[i1:i2] = replacement

    for index, item in enumerate(result):
        if item is not None:
            continue
        previous = next((entry for entry in reversed(result[:index]) if entry), None)
        following = next((entry for entry in result[index + 1:] if entry), None)
        start = float(previous["end"]) if previous else 0.0
        end = float(following["start"]) if following else duration_seconds
        result[index] = {
            "word": original_words[index],
            "start": round(start, 3),
            "end": round(max(start, end), 3),
        }

    return result


def transcribe_word_timestamps(audio_bytes: bytes, text: str, language: str | None, duration_seconds: float):
    if not ALIGNER_ENABLED:
        return [], "disabled"

    model = get_aligner()
    with io.BytesIO(audio_bytes) as audio_file:
        segments, _info = model.transcribe(
            audio_file,
            language=language_code(language),
            beam_size=5,
            condition_on_previous_text=False,
            vad_filter=True,
            word_timestamps=True,
        )
        transcript_words = []
        for segment in segments:
            for word in segment.words or []:
                if word.start is None or word.end is None:
                    continue
                transcript_words.append({
                    "word": str(word.word).strip(),
                    "start": float(word.start),
                    "end": float(word.end),
                })

    return align_word_timestamps(text, transcript_words, duration_seconds), "faster-whisper"


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_ID,
        "device": DEVICE,
        "loaded": get_model.cache_info().currsize > 0,
        "aligner": {
            "enabled": ALIGNER_ENABLED,
            "model": ALIGNER_MODEL_ID,
            "device": ALIGNER_DEVICE,
            "compute_type": ALIGNER_COMPUTE_TYPE,
            "loaded": get_aligner.cache_info().currsize > 0,
        },
    }


@app.get("/diagnostics")
def diagnostics():
    return {
        "service": "qwen3-tts",
        "status": "ok",
        "model": MODEL_ID,
        "voice": DEFAULT_VOICE,
        "language": DEFAULT_LANGUAGE,
        "device": DEVICE,
        "ttsLoaded": get_model.cache_info().currsize > 0,
        "subtitleTiming": {
            "enabled": ALIGNER_ENABLED,
            "method": "faster-whisper-word-timestamps" if ALIGNER_ENABLED else "disabled",
            "model": ALIGNER_MODEL_ID,
            "device": ALIGNER_DEVICE,
            "computeType": ALIGNER_COMPUTE_TYPE,
            "loaded": get_aligner.cache_info().currsize > 0,
        },
    }


@app.get("/v1/models")
def models():
    return {"data": [{"id": MODEL_ID, "object": "model", "owned_by": "Qwen"}], "object": "list"}


@app.post("/v1/audio/speech")
def speech(request: SpeechRequest):
    response_format = request.response_format.lower()
    if response_format not in {"wav", "json"}:
        raise HTTPException(status_code=400, detail="The Helix fallback supports response_format 'wav' or 'json'.")

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
        audio_bytes = buffer.getvalue()
        duration_seconds = len(wavs[0]) / float(sample_rate)

        try:
            word_timestamps, timing_method = transcribe_word_timestamps(audio_bytes, request.input, language, duration_seconds)
        except Exception as exc:
            word_timestamps = proportional_timestamps(request.input.split(), 0.0, duration_seconds)
            timing_method = f"proportional-fallback:{type(exc).__name__}"

        if response_format == "wav":
            return Response(content=audio_bytes, media_type="audio/wav")

        return {
            "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
            "format": "wav",
            "sample_rate": sample_rate,
            "duration_seconds": round(duration_seconds, 3),
            "word_timestamps": word_timestamps,
            "timing_method": timing_method,
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
