# Voxora single-host GPU coordination infrastructure (opt-in)

This directory defines a **dedicated lock-only Redis 7 service** for GPU coordination.
It is separate from the existing `voxora-media` Redis **queue database** and does
not replace TTS or media services.

**This is infrastructure preparation, not permission to enable CUDA scheduling.**
Both services currently default to `GPU_COORDINATION_ENABLED=false`.
Do not enable either service until concurrent Qwen/Whisper testing, lock-loss
handling and TTS latency policy are validated.

## Security and topology

- Redis listens on port 6379 **only inside** Docker's `voxora-gpu-coordination` bridge.
  There are no published host ports.
- Password is generated locally, provided as a Docker Compose file secret, and
  never committed. Use a separate, high-entropy password from all other Redis servers.
- Redis is ephemeral (no snapshots/AOF) and uses `noeviction` for coordination keys.
  If Redis restarts, outstanding leases are lost; GPU execution must fail closed.
  **Existing GPU kernels cannot be forcibly preempted by Redis locks.**
- Only `tts-service.gateway` and `gpu-media-service.worker` should join the
  shared network. Existing TTS engine DNS and media job-queue networking remain
  on their respective default Compose networks.
- Do not attach unrelated application containers to the coordination bridge.

## Prepare secret (one-time; GPU host only)

Run from repository root after merging this infrastructure PR:

```bash
cd /opt/voxora-gpu/video-director
umask 077
install -d -m 700 gpu-coordination/secrets
openssl rand -hex 32 > gpu-coordination/secrets/redis_password.txt
chmod 644 gpu-coordination/secrets/redis_password.txt
git status --short
```

The file is gitignored. The local secret directory is mode 700 (not traversable by other host users); the file uses mode 644 so the unprivileged Redis user can read the bind-mounted Compose secret. Compose file-backed secrets may not support uid/gid/mode remapping. Do not relax the directory permissions. **Do not paste the password into chat, GitHub, or logs.**
Do not commit any `.env` files containing coordinator credentials.

## Validate Compose without changing the live services

```bash
cd /opt/voxora-gpu/video-director
bash scripts/validate_gpu_coordination_compose.sh
```

This validates the dedicated coordinator file and optional overlays against
the existing live TTS base Compose file. The TTS base file is currently an
untracked, locally preserved deployment file; the overlay does not replace it.

## Optional: start only the coordinator, not the TTS/media stacks

Once Compose validation passes and you are ready to test networking, this
starts only the new independent Redis container and network:

```bash
cd /opt/voxora-gpu/video-director/gpu-coordination
sudo docker compose -p voxora-coordination -f docker-compose.yml up -d
sudo docker compose -p voxora-coordination -f docker-compose.yml ps
```

**Do not** run the TTS/media overlay `up` commands yet. They would reconnect
or recreate existing service containers to attach an additional network; this
must be done during a planned, verified maintenance window after testing.

To stop the coordinator without affecting TTS or media:

```bash
sudo docker compose -p voxora-coordination -f docker-compose.yml down
```

Note: Docker will not delete the named bridge network while other containers
still use it.

## Later activation (NOT approved by this PR)

The future overlay commands will use:

```bash
# TTS — compose existing local base plus optional overlay:
# cd tts-service
# sudo docker compose -p voxora-gpu -f docker-compose.gpu.yml -f docker-compose.coordination.yml config

# Media — worker joins shared network, not media queue Redis:
# cd gpu-media-service
# sudo docker compose -p voxora-media -f docker-compose.gpu.yml -f docker-compose.coordination.yml --profile worker config
```

Both services must use an identical authenticated URL pointing to the
`voxora-gpu-coordinator` alias. Keep these values unset in this phase:

```text
GPU_COORDINATION_ENABLED=false
GPU_MEDIA_WHISPER_DEVICE=cpu
GPU_MEDIA_HEAVY_ENABLED=false
```

Do not manually append the coordinator password to tracked Compose files.
The media worker's existing `GPU_MEDIA_REDIS_URL=redis://redis:6379/0`
continues to refer to its **separate** RQ queue Redis.

## Outstanding release blockers

1. Verify the coordinator starts healthy with secret mounted read-only.
2. Validate both overlays preserve the original internal Docker DNS, host
   port bindings, volumes, Qwen3 CUDA settings, and restart policies.
3. Test TTS/Whisper concurrency with both containers connected to this Redis.
4. Handle Redis interruption / expired ownership while a long native GPU
   operation is already running; the Redis TTL is not a preemption mechanism.
5. Establish TTS priority/admission policy before enabling SDXL/Wan.
6. Maintain rollback steps for restarting the old Compose configuration.

Existing standalone real-Redis protocol tests can be rerun independently:

```bash
bash scripts/test_gpu_redis_integration.sh
```

The test runner uses its **own disposable Redis**, not this coordinator.

## Verify the real coordinator without changing live TTS/media containers

After starting the coordinator and confirming it is healthy, run:

```bash
cd /opt/voxora-gpu/video-director
bash scripts/smoke_gpu_coordinator.sh
```

The script uses the **existing** `voxora-media-worker:latest` image as a
disposable client, joining only the shared Docker network. It mounts the local
coordinator secret read-only and **does not pass credentials in CLI arguments
or log them**. Both TTS and media lease modules are loaded from Git checkout
read-only. The test verifies network/DNS, authenticated Redis access, refusal
of unauthenticated requests, bi-directional TTS/media contention on a **unique
test-only Redis key**, and safe lease release.

The probe does NOT attach the existing `voxora-gpu` TTS gateway or
`voxora-media` worker, update production environment variables, restart
Docker containers, invoke CUDA or publish ports.

If Compose displayed **"network exists but was not created by compose"**, it
reused an existing named bridge. Review ownership before reconfiguring that
network:

```bash
sudo docker network inspect voxora-gpu-coordination \
  --format '{{json .Labels}}'
sudo docker network inspect voxora-gpu-coordination \
  --format '{{range .Containers}}{{.Name}} {{end}}'
```

Do not delete/recreate the existing network while the coordinator or other
containers are attached. The network warning alone is not a Redis failure.

**Security:** Keep the secret file under the protected, gitignored
`gpu-coordination/secrets` directory. Avoid command tracing (`set -x`)
during credential handling. Docker administrators can inspect container
mounts and read credentials; protect Docker daemon access.

Passing this probe is a **network and lease protocol gate only**. Running
TTS/media containers will still need a planned, tested way to read
authentication credentials, and Redis ownership loss during active CUDA
inference still needs fail-safe behavior before scheduling activation.
