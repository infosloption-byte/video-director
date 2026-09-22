# Helix self-hosted TTS service

This service moves narration inference off the main Helix application EC2 instance and onto a dedicated CPU-only TTS EC2 instance.

Architecture

Helix server -> private HTTP -> TTS gateway :8000 -> selected worker -> WAV -> Helix server -> existing MP3 storage

Workers

- Kokoro-82M: default standard narration.
- MeloTTS v3: alternative English narration.
- Chatterbox-Nano: voice cloning with an audio reference.
- Qwen3-TTS 0.6B Base: voice cloning fallback for stored voice profiles.

The gateway keeps one worker resident at a time. When a different engine is requested, the gateway asks other workers to unload their models. This keeps CPU-only memory predictable.

AWS deployment

Use a dedicated c5a.2xlarge Linux EC2 instance.

    cd tts-service
    cp .env.example .env
    openssl rand -hex 32

Put the generated value into TTS_AUTH_TOKEN in .env.

    docker compose build
    docker compose up -d

The first synthesis for an engine downloads its model weights. The shared hf-cache volume keeps downloaded weights across container restarts.

Check the gateway:

    curl http://127.0.0.1:8000/health
    curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:8000/diagnostics

Do not expose ports 8101-8104 in Docker or the EC2 security group.

Security group

Allow inbound TCP 8000 only from the existing Helix application EC2 security group. Prefer a private VPC address for the TTS instance. No public browser traffic should call the TTS gateway directly.

Voice cloning

Create a voice profile:

    curl -X POST http://127.0.0.1:8000/v1/voices \
      -H "Authorization: Bearer YOUR_TOKEN" \
      -F "name=Construction Narrator" \
      -F "reference_text=The reference transcript for this recording." \
      -F "preferred_engine=chatterbox-nano" \
      -F "reference_audio=@reference.wav"

The returned voice_id can be used by Helix.

Qwen3-TTS 0.6B Base benefits from a clean reference transcript. Without one, its worker uses x-vector-only cloning mode.

Example standard synthesis:

    curl -X POST http://127.0.0.1:8000/v1/audio/speech \
      -H "Authorization: Bearer YOUR_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"text":"Welcome to Helix.","engine":"kokoro"}'

Example voice-cloned synthesis:

    curl -X POST http://127.0.0.1:8000/v1/audio/speech \
      -H "Authorization: Bearer YOUR_TOKEN" \
      -H "Content-Type: application/json" \
      -d '{"text":"Welcome to Helix.","voice_id":"voice_xxx"}'

The response contains audio_base64, format, sample_rate, duration_seconds, engine, fallback, and word_timestamps. The Helix server converts the WAV to MP3 and continues using the existing /api/audio/... delivery path.

Model licensing

Current upstream model pages identify Kokoro-82M as Apache-2.0, MeloTTS-English-v3 as MIT, Chatterbox-Nano as MIT, and Qwen3-TTS-12Hz-0.6B-Base as Apache-2.0. Recheck upstream licenses and dependency licenses before each production release.
