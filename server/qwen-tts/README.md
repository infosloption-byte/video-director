# Qwen3-TTS narration fallback

Helix keeps ElevenLabs as the primary narration provider and uses Qwen3-TTS only when ElevenLabs fails or is unavailable. The Qwen service lives in `server/qwen-tts` but runs as a separate Python process/container from the Node backend.

## Local development

### Option A — Python directly on the same machine

Create an environment in `server/qwen-tts`:

```bash
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

For NVIDIA GPU inference, install a PyTorch build compatible with the local CUDA driver. GPU inference is recommended for the 1.7B model.

Start the service:

```bash
cd server/qwen-tts
.venv\\Scripts\\python -m uvicorn service:app --host 127.0.0.1 --port 8000
```

Then keep the backend config at:

```env
QWEN3_TTS_ENABLED="true"
QWEN3_TTS_URL="http://127.0.0.1:8000"
```

### Option B — Docker on a local NVIDIA machine

From `server/qwen-tts`:

```bash
docker compose up -d --build
docker compose logs -f qwen-tts
```

The bundled Compose file uses NVIDIA GPU access, exposes port 8000 on localhost, and persists the Hugging Face cache so model weights are not downloaded again after every container recreation.

For a Dockerized Helix backend, use:

```env
QWEN3_TTS_ENABLED="true"
QWEN3_TTS_URL="http://host.docker.internal:8000"
```

On a non-NVIDIA development machine, use Option A with a CPU-compatible PyTorch configuration instead of the GPU Docker Compose file.

## AWS: separate Qwen GPU server

Recommended layout:

```text
AWS VPC
  EC2 #1 — Helix frontend + Node backend
      |
      | private VPC HTTP :8000
      v
  EC2 #2 — Qwen3-TTS GPU server
      server/qwen-tts Docker container
```

The Node backend treats `QWEN3_TTS_URL` as a remote service URL, so the same code works locally and on AWS. Set the production backend environment to the private address of the Qwen instance, for example:

```env
QWEN3_TTS_ENABLED="true"
QWEN3_TTS_URL="http://10.0.2.25:8000"
QWEN3_TTS_TIMEOUT_MS="120000"
QWEN3_TTS_AUTH_TOKEN="use-a-shared-secret-here"
```

On the Qwen EC2 instance, change the Docker port binding from localhost to the instance/VPC interface, for example:

```yaml
ports:
  - "0.0.0.0:8000:8000"
```

Do not expose TCP 8000 to the public internet. In the AWS security group, allow inbound TCP 8000 only from the Helix backend EC2 security group. The shared token in `QWEN3_TTS_AUTH_TOKEN` adds a second layer of protection.

## Model and first-run behavior

The Qwen service downloads model weights when the model is first loaded unless weights are already present in the Hugging Face cache. The Docker configuration mounts `/cache/huggingface` into a persistent named volume for this reason.

The Qwen service exposes:

```text
GET  /health
GET  /diagnostics
GET  /v1/models
POST /v1/audio/speech
```

The backend sends JSON requests to `/v1/audio/speech` and asks for a JSON response containing base64 WAV audio plus duration and word timing metadata.

## Subtitle timing

Qwen3-TTS generates the speech waveform; it is not treated as an ElevenLabs character-alignment source. After generation, Helix runs faster-whisper with word timestamps and maps the audio-derived timings back onto the original script words. This produces real audio-derived timing rather than dividing the whole scene duration evenly by character count.

Default configuration:

```env
QWEN3_TTS_ALIGNER_ENABLED="true"
QWEN3_TTS_ALIGNER_MODEL="small"
QWEN3_TTS_ALIGNER_DEVICE="cpu"
QWEN3_TTS_ALIGNER_COMPUTE_TYPE="int8"
```

When alignment fails, the service keeps the narration usable with proportional timing and identifies that fallback in `timing_method`.

## Provider behavior

1. ElevenLabs is attempted first.
2. Missing key, quota/rate-limit errors, network failures, or other ElevenLabs failures trigger Qwen when `QWEN3_TTS_ENABLED=true`.
3. Qwen returns generated audio and audio-derived word timings.
4. The Node service converts Qwen WAV output to the same MP3 scene path used by ElevenLabs, so the editor does not need a separate playback path.
5. When both providers fail, Helix returns an error containing the failures from both providers.
