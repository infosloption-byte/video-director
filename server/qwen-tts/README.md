# Qwen3-TTS narration fallback

Helix keeps ElevenLabs as the primary narration provider and uses this local service only when ElevenLabs fails or is unavailable.

The service uses the Qwen3-TTS 1.7B CustomVoice checkpoint with a stable preset speaker. Qwen documents the 1.7B CustomVoice model and its `generate_custom_voice` API; supported speakers include Ryan and Aiden for English.

## Setup

Create a Python 3.10+ environment in `server/qwen-tts` and install dependencies:

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

For NVIDIA GPU inference, install a PyTorch build compatible with your CUDA environment before running the service. GPU inference is recommended for the 1.7B model.

Start the service from the repository root:

```bash
cd server/qwen-tts
.venv\\Scripts\\python -m uvicorn service:app --host 127.0.0.1 --port 8000
```

The first synthesis loads the Qwen model and may download model weights. When subtitle alignment is enabled, the first alignment also loads the configured faster-whisper model.

Check the service:

```text
GET http://127.0.0.1:8000/health
GET http://127.0.0.1:8000/diagnostics
```

## Accurate Qwen subtitle timing

Qwen3-TTS itself generates the speech waveform; it does not provide ElevenLabs-style character alignment in this integration. After generation, Helix runs faster-whisper on the generated WAV with word-level timestamps, then maps those audio-derived timings back onto the original script words. faster-whisper documents word timestamps derived from the model's cross-attention and dynamic time warping, plus VAD support.

The default alignment configuration is:

```env
QWEN3_TTS_ALIGNER_ENABLED="true"
QWEN3_TTS_ALIGNER_MODEL="small"
QWEN3_TTS_ALIGNER_DEVICE="cpu"
QWEN3_TTS_ALIGNER_COMPUTE_TYPE="int8"
```

This keeps the aligner off the Qwen GPU by default. Set `QWEN3_TTS_ALIGNER_ENABLED="false"` only when the extra alignment pass is not desired; Helix will then use its proportional timing fallback.

## Helix configuration

Enable the fallback in `server/.env`:

```env
QWEN3_TTS_ENABLED="true"
QWEN3_TTS_URL="http://127.0.0.1:8000"
QWEN3_TTS_MODEL="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"
QWEN3_TTS_VOICE="Ryan"
QWEN3_TTS_LANGUAGE="English"
QWEN3_TTS_VOICE_INSTRUCT="Warm, clear documentary narrator. Natural pacing, confident, calm, and easy to understand."
QWEN3_TTS_TIMEOUT_MS="120000"
QWEN3_TTS_ALIGNER_ENABLED="true"
QWEN3_TTS_ALIGNER_MODEL="small"
QWEN3_TTS_ALIGNER_DEVICE="cpu"
QWEN3_TTS_ALIGNER_COMPUTE_TYPE="int8"
```

`Ryan` and `Aiden` are English CustomVoice speakers. Change `QWEN3_TTS_VOICE` to another supported speaker when needed.

## Request contract

The Node service calls:

```http
POST /v1/audio/speech
Content-Type: application/json
```

with a body similar to:

```json
{
  "model": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
  "input": "This is a Helix narration test.",
  "voice": "Ryan",
  "language": "English",
  "instruct": "Warm, clear documentary narrator.",
  "response_format": "json"
}
```

For `response_format=json`, the service returns base64 WAV audio plus `duration_seconds`, `word_timestamps`, and `timing_method`. Helix converts the WAV to the same MP3 scene path used by ElevenLabs, so the editor does not need a separate audio path or playback implementation.

## Diagnostics

The backend exposes an authenticated endpoint at `/api/tts/diagnostics`. It reports the provider order, whether ElevenLabs is configured, whether Qwen is reachable, and the Qwen subtitle-timing configuration without exposing the ElevenLabs API key.

## Provider order

1. ElevenLabs is attempted first.
2. If ElevenLabs is not configured, rate-limited, out of quota, unavailable, or returns another provider error, Helix attempts Qwen3-TTS when `QWEN3_TTS_ENABLED=true`.
3. Qwen returns audio-derived word timings when the faster-whisper aligner succeeds.
4. If alignment fails, Helix keeps the narration usable with proportional word timing and labels the timing method in the response.
5. If both providers fail, the returned error includes the failure from each provider.
