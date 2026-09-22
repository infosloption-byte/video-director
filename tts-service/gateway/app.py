from __future__ import annotations

import asyncio
import json
import os
import subprocess
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

APP_NAME = "Helix Self-Hosted TTS Gateway"
DATA_ROOT = Path(os.getenv("TTS_DATA_ROOT", "/data"))
VOICE_ROOT = DATA_ROOT / "voices"
VOICE_ROOT.mkdir(parents=True, exist_ok=True)

AUTH_TOKEN = os.getenv("TTS_AUTH_TOKEN", "").strip()
DEFAULT_ENGINE = os.getenv("TTS_DEFAULT_ENGINE", "kokoro").strip()
FALLBACK_ENGINES = [
    value.strip()
    for value in os.getenv(
        "TTS_FALLBACK_ENGINES",
        "melotts-v3,chatterbox-nano,qwen3-tts-0.6b",
    ).split(",")
    if value.strip()
]
TIMEOUT_SECONDS = max(5.0, float(os.getenv("TTS_WORKER_TIMEOUT_SECONDS", "180")))
MAX_TEXT_CHARS = max(1000, int(os.getenv("TTS_MAX_TEXT_CHARS", "12000")))
MAX_VOICE_BYTES = max(1_000_000, int(os.getenv("TTS_MAX_VOICE_BYTES", "25000000")))

WORKERS = {
    "kokoro": os.getenv("TTS_WORKER_KOKORO_URL", "http://kokoro:8101").rstrip("/"),
    "melotts-v3": os.getenv("TTS_WORKER_MELO_URL", "http://melotts-v3:8102").rstrip("/"),
    "chatterbox-nano": os.getenv("TTS_WORKER_CHATTERBOX_URL", "http://chatterbox-nano:8103").rstrip("/"),
    "qwen3-tts-0.6b": os.getenv("TTS_WORKER_QWEN_URL", "http://qwen3-tts-0.6b:8104").rstrip("/"),
}
CLONE_ENGINES = {"chatterbox-nano", "qwen3-tts-0.6b"}

class SpeechRequest(BaseModel):
    text: str = Field(min_length=1)
    engine: str | None = None
    voice_id: str | None = None
    language: str | None = None
    instruct: str | None = None
    speed: float = Field(default=1.0, ge=0.25, le=3.0)
    temperature: float | None = Field(default=None, ge=0.1, le=2.0)
    allow_fallback: bool = True

app = FastAPI(title=APP_NAME, version="1.0.0")
resident_engine: str | None = None
synthesis_lock = asyncio.Lock()

def require_auth(authorization: str | None = Header(default=None)) -> None:
    if not AUTH_TOKEN:
        return
    if authorization != f"Bearer {AUTH_TOKEN}":
        raise HTTPException(status_code=401, detail="Invalid TTS service credentials.")

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def voice_dir(voice_id: str) -> Path:
    safe = Path(voice_id).name
    if safe != voice_id or not safe:
        raise HTTPException(status_code=400, detail="Invalid voice_id.")
    return VOICE_ROOT / safe

def load_voice(voice_id: str) -> dict[str, Any]:
    directory = voice_dir(voice_id)
    metadata_path = directory / "metadata.json"
    reference_path = directory / "reference.wav"
    if not metadata_path.exists() or not reference_path.exists():
        raise HTTPException(status_code=404, detail="Voice profile not found.")
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail="Voice metadata is invalid.") from exc
    metadata["reference_path"] = str(reference_path)
    return metadata

async def worker_request(
    engine: str,
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    url = WORKERS[engine] + path
    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
        response = await client.request(
            method,
            url,
            json=payload,
            headers={"Accept": "application/json"},
        )
    if response.status_code >= 400:
        try:
            detail = response.json().get("detail") or response.text
        except Exception:
            detail = response.text
        error = RuntimeError(f"{engine}: HTTP {response.status_code}: {detail}")
        setattr(error, "status_code", response.status_code)
        raise error
    return response.json()

async def ensure_resident(engine: str) -> None:
    global resident_engine
    if resident_engine == engine:
        return
    for other_engine in WORKERS:
        if other_engine == engine:
            continue
        try:
            await worker_request(other_engine, "POST", "/unload")
        except Exception:
            pass
    resident_engine = engine

def choose_engine(requested_engine: str | None, voice_id: str | None) -> str:
    if voice_id and not requested_engine:
        voice = load_voice(voice_id)
        preferred = str(voice.get("preferred_engine") or "").strip()
        if preferred in CLONE_ENGINES:
            return preferred
        return "chatterbox-nano"

    engine = requested_engine or DEFAULT_ENGINE
    if engine not in WORKERS:
        raise HTTPException(status_code=400, detail=f"Unsupported TTS engine: {engine}.")
    if voice_id and engine not in CLONE_ENGINES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Engine '{engine}' does not support voice cloning. "
                "Use Chatterbox-Nano or Qwen3-TTS 0.6B Base."
            ),
        )
    return engine

def fallback_order(primary: str, voice_id: str | None) -> list[str]:
    values = [primary]
    if voice_id:
        values.extend(
            engine
            for engine in FALLBACK_ENGINES
            if engine in CLONE_ENGINES and engine not in values
        )
    else:
        values.extend(
            engine
            for engine in FALLBACK_ENGINES
            if engine in {"kokoro", "melotts-v3", "chatterbox-nano"} and engine not in values
        )
    return values

@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "helix-tts",
        "residentEngine": resident_engine,
        "engines": list(WORKERS),
    }

@app.get("/diagnostics", dependencies=[Depends(require_auth)])
async def diagnostics() -> dict[str, Any]:
    results: dict[str, Any] = {}
    async with httpx.AsyncClient(timeout=min(TIMEOUT_SECONDS, 10.0)) as client:
        for engine, url in WORKERS.items():
            try:
                response = await client.get(url + "/health")
                response.raise_for_status()
                payload = response.json()
                results[engine] = {
                    "configured": True,
                    "reachable": True,
                    "url": url,
                    **payload,
                }
            except Exception as exc:
                results[engine] = {
                    "configured": True,
                    "reachable": False,
                    "url": url,
                    "error": str(exc),
                }
    return {
        "service": "helix-tts",
        "ok": any(item.get("reachable") for item in results.values()),
        "residentEngine": resident_engine,
        "defaultEngine": DEFAULT_ENGINE,
        "fallbackEngines": FALLBACK_ENGINES,
        "engines": results,
    }

@app.post("/v1/audio/speech", dependencies=[Depends(require_auth)])
async def synthesize(request: SpeechRequest) -> dict[str, Any]:
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"Text exceeds {MAX_TEXT_CHARS} characters.",
        )

    primary = choose_engine(request.engine, request.voice_id)
    voice = load_voice(request.voice_id) if request.voice_id else None
    attempts: list[dict[str, Any]] = []

    engines = (
        fallback_order(primary, request.voice_id)
        if request.allow_fallback
        else [primary]
    )

    async with synthesis_lock:
        for engine_name in engines:
            payload: dict[str, Any] = {
                "text": text,
                "voice_id": request.voice_id,
                "language": request.language,
                "instruct": request.instruct,
                "speed": request.speed,
                "temperature": request.temperature,
            }
            if voice:
                payload["reference_path"] = voice["reference_path"]
                payload["reference_text"] = voice.get("reference_text") or None

            try:
                await ensure_resident(engine_name)
                result = await worker_request(
                    engine_name,
                    "POST",
                    "/synthesize",
                    payload,
                )
                result["engine"] = engine_name
                result["fallback"] = engine_name != primary
                result["requested_engine"] = primary
                return result
            except Exception as exc:
                attempts.append({"engine": engine_name, "error": str(exc)})

    raise HTTPException(
        status_code=503,
        detail={
            "message": "All configured TTS engines failed.",
            "requested_engine": primary,
            "attempts": attempts,
        },
    )

@app.get("/v1/voices", dependencies=[Depends(require_auth)])
async def list_voices() -> dict[str, Any]:
    voices: list[dict[str, Any]] = []
    if not VOICE_ROOT.exists():
        return {"voices": voices}
    for directory in sorted(VOICE_ROOT.iterdir()):
        if not directory.is_dir():
            continue
        metadata_path = directory / "metadata.json"
        reference_path = directory / "reference.wav"
        if not metadata_path.exists() or not reference_path.exists():
            continue
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            voices.append(metadata)
        except json.JSONDecodeError:
            continue
    return {"voices": voices}

@app.post("/v1/voices", dependencies=[Depends(require_auth)])
async def create_voice(
    name: str = Form(...),
    reference_audio: UploadFile = File(...),
    reference_text: str = Form(default=""),
    preferred_engine: str = Form(default="chatterbox-nano"),
) -> dict[str, Any]:
    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Voice name is required.")
    if preferred_engine not in CLONE_ENGINES:
        raise HTTPException(
            status_code=400,
            detail="preferred_engine must be chatterbox-nano or qwen3-tts-0.6b.",
        )

    content = await reference_audio.read(MAX_VOICE_BYTES + 1)
    if len(content) > MAX_VOICE_BYTES:
        raise HTTPException(status_code=413, detail="Reference audio is too large.")
    if not content:
        raise HTTPException(status_code=400, detail="Reference audio is empty.")

    voice_id = f"voice_{uuid.uuid4().hex}"
    directory = voice_dir(voice_id)
    directory.mkdir(parents=True, exist_ok=False)

    suffix = Path(reference_audio.filename or "").suffix.lower() or ".audio"
    with tempfile.NamedTemporaryFile(
        prefix="helix-voice-",
        suffix=suffix,
        delete=False,
    ) as temp_file:
        temp_path = Path(temp_file.name)
        temp_file.write(content)

    reference_path = directory / "reference.wav"
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(temp_path),
                "-ac",
                "1",
                "-ar",
                "24000",
                str(reference_path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        reference_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=400,
            detail="Reference audio could not be decoded.",
        ) from exc
    finally:
        temp_path.unlink(missing_ok=True)

    metadata = {
        "voice_id": voice_id,
        "name": normalized_name,
        "preferred_engine": preferred_engine,
        "reference_text": reference_text.strip(),
        "created_at": now_iso(),
    }
    (directory / "metadata.json").write_text(
        json.dumps(metadata, indent=2),
        encoding="utf-8",
    )
    return metadata

@app.get("/v1/voices/{voice_id}", dependencies=[Depends(require_auth)])
async def get_voice(voice_id: str) -> dict[str, Any]:
    metadata = load_voice(voice_id)
    metadata.pop("reference_path", None)
    return metadata

@app.delete("/v1/voices/{voice_id}", dependencies=[Depends(require_auth)])
async def delete_voice(voice_id: str) -> dict[str, Any]:
    directory = voice_dir(voice_id)
    if not directory.exists():
        raise HTTPException(status_code=404, detail="Voice profile not found.")
    for path in directory.iterdir():
        path.unlink(missing_ok=True)
    directory.rmdir()
    return {"deleted": True, "voice_id": voice_id}

@app.post("/unload", dependencies=[Depends(require_auth)])
async def unload_all_models() -> dict[str, Any]:
    global resident_engine
    for engine_name in WORKERS:
        try:
            await worker_request(engine_name, "POST", "/unload")
        except Exception:
            pass
    resident_engine = None
    return {"ok": True}
