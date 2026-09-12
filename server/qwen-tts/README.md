# Qwen3-TTS narration fallback

Helix keeps ElevenLabs as the primary narration provider and uses this local service only when ElevenLabs fails or is unavailable.

The service uses the Qwen3-TTS 1.7B CustomVoice checkpoint with a stable preset speaker. Qwen documents the 1.7B CustomVoice model and its `generate_custom_voice` API; supported speakers include Ryan and Aiden for English. citeturn387864search0

## Setup

Create a Python 3.10+ environment in `server/qwen-tts` and install dependencies:

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

For NVIDIA GPU inference, install a PyTorch build compatible with your CUDA environment before running the service. Qwen recommends GPU inference for the 1.7B model. citeturn141574search1turn387864search0

Start the service from the repository root:

```bash
cd server/qwen-tts
.venv\\Scripts\\python -m uvicorn service:app --host 127.0.0.1 --port 8000
```

The first synthesis loads the model and may download model weights. Qwen documents automatic model-weight download through the Python package and also provides manual download options. citeturn141574search1

Check the service:

```text
GET http://127.0.0.1:8000/health
```

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
```

`Ryan` is an English CustomVoice speaker documented by Qwen. `Aiden` is another English option. citeturn387864search0

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
  "response_format": "wav"
}
```

The endpoint returns PCM-16 WAV audio. Helix converts that temporary WAV to the same MP3 scene path used by ElevenLabs, so the editor does not need a separate audio path or playback implementation.

## Provider order

1. ElevenLabs is attempted first.
2. If ElevenLabs is not configured, rate-limited, out of quota, unavailable, or returns another provider error, Helix attempts Qwen3-TTS when `QWEN3_TTS_ENABLED=true`.
3. If both providers fail, the returned error includes the failure from each provider.
