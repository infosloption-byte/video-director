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

## Stage 6: read-only secret integration in optional service overlays

The `tts-service/docker-compose.coordination.yml` and
`gpu-media-service/docker-compose.coordination.yml` overlays now mount the
same local coordinator password as a read-only Docker Compose secret at
`/run/secrets/coordinator_password`. Both set:

```text
GPU_COORDINATION_ENABLED=false
GPU_COORDINATION_REDIS_HOST=voxora-gpu-coordinator
GPU_COORDINATION_REDIS_PASSWORD_FILE=/run/secrets/coordinator_password
```

The worker overlay also pins `GPU_MEDIA_WHISPER_DEVICE=cpu` and
`GPU_MEDIA_HEAVY_ENABLED=false`. These are **safety defaults**, not an
activation procedure.

Both Python clients now prefer an absolute secret path to a URL. Supplying
both `GPU_COORDINATION_REDIS_URL` and
`GPU_COORDINATION_REDIS_PASSWORD_FILE` is rejected when coordination is
enabled. Do not store the Redis password in tracked files, .env, shell
history, or service environment variables.

**Manual validation after merging this PR, with no Docker restarts:**

```bash
cd /opt/voxora-gpu/video-director
bash scripts/validate_gpu_coordination_compose.sh
bash scripts/smoke_gpu_coordinator.sh

cd gpu-media-service
sudo docker run --rm --network none \
  -v "$PWD/media_service:/app/media_service:ro" \
  -v "$PWD/tests:/app/tests:ro" \
  --workdir /app --entrypoint python \
  voxora-media-worker:latest \
  -B -m unittest discover -s tests -p 'test_gpu_*.py' -v
```

The smoke script now invokes the **actual TTS and media client
constructors**, reading a mounted password file from the disposable client.
This confirms both real client implementations can authenticate without
placing the password in the URL. It does **not** test that the running TTS
gateway/worker has the secret mounted.

**DO NOT apply the service overlays with `up -d` yet.** A Compose overlay
may recreate existing TTS or media containers to add networks and secrets.
The runtime flag remains off and no GPU inference behavior changes until
the gateway and worker are rebuilt/deployed in a controlled maintenance
window, health-checked, and verified to keep their prior networks.

Before enabling shared GPU locks, investigate lease-loss handling during
native inference. A Redis lease can expire while a CUDA kernel is still
running, and the current lease alone cannot stop that kernel or guarantee
latency priority for TTS.

## Stage 7: build and probe new images BEFORE any service recreation

When the existing host tests have passed, use the following **non-disruptive**
preflight to check the actual deployable images, rather than only host-mounted
source modules:

```bash
cd /opt/voxora-gpu/video-director
bash scripts/preflight_gpu_staged_images.sh
```

This script:

- Validates all three Compose configurations without applying them.
- Builds **separate, explicitly tagged** `voxora-gateway-coordination-preflight:20261101`
  and `voxora-media-coordination-preflight:20261101` images from source,
  without replacing the running `voxora-gpu` or `voxora-media` image tags.
- Starts disposable containers on `voxora-gpu-coordination` with
  `GPU_COORDINATION_ENABLED=false` and the Redis password **bind-mounted
  read-only**. No ports are published; no GPU device or media queue is used.
- Imports the real TTS FastAPI app and media worker job module from the new
  images and checks Redis authentication through each service's factory.
- Verifies the original gateway and media worker container IDs/start times
  are unchanged after testing.

The script **builds Docker images**, which may use disk, CPU, and network
bandwidth. It does not rebuild, stop, recreate, or update production service
containers. Avoid doing it during active, high-load GPU processing.

Passing the staged-image preflight is needed before any planned deployment
that attaches the real TTS gateway or media worker to the coordination bridge.
It does **not** validate native GPU inference, lease-loss behavior, or TTS
priority. Do not run the optional service Compose overlays with `up` yet.

### Future deployment safety checklist (not part of this preflight)

During a separate maintenance window, before recreating any service:

1. Make a private backup of the live, **untracked**
   `tts-service/docker-compose.gpu.yml` and its local environment file.
   Do not overwrite or commit either file.
2. Record running TTS gateway and media worker image IDs, container IDs,
   their healthy endpoints, volume mounts, and network names.
   Do not post their complete Docker inspect output or environment, as
   these may contain credentials.
3. Confirm both new images work on the host and that the overlays preserve
   original DNS for all TTS engines and the media Redis queue.
4. Recreate **only** gateway and worker, one at a time, under coordinated
   observation; keep `GPU_COORDINATION_ENABLED=false` throughout.
5. Verify TTS speech and queued CPU transcription still work. If either
   regresses, return to the backed-up pre-overlay Compose configuration,
   preserving data and volumes.
6. Only after real coordination interruption and concurrent Qwen/Whisper
   tests should GPU scheduling be considered for activation. SDXL/Wan
   must remain disabled until separately profiled.

Do not treat the shared Redis lease as CUDA preemption. Expiry of the
Redis key does not stop an already-running GPU kernel.

## Stage 8: compare current live Compose definitions before any rollout

A successful Docker image preflight confirms that new image imports and Redis
authentication work, but not that combining the overlays with your *actual*
live Compose configuration preserves existing behavior. The live TTS base
`tts-service/docker-compose.gpu.yml` is untracked, so this comparison must run
**on the GPU server**, not in CI.

After merging the dry-run validation PR, run:

```bash
cd /opt/voxora-gpu/video-director
python3 -m unittest discover -s scripts/tests \
  -p 'test_gpu_rollout_compare.py' -v
bash scripts/validate_gpu_coordination_compose.sh
```

The validator now runs an additional **read-only** comparison between the
actual `docker compose config --format json` outputs with and without each
overlay. No container is started, stopped, recreated, or joined to a network.

It blocks overlays that:

- Change unrelated services (including Kokoro/Qwen workers or media Redis).
- Change gateway/worker image/build, volumes, host ports, dependencies,
  resource/GPU settings, or their existing network memberships.
- Add unexpected networks or remove any existing network membership.
- Remove existing secrets, add an unexpected secret, or point at a
  different secret file.
- Change unrelated environment settings or enable GPU coordination,
  GPU Whisper or heavy media inference.

It prints only sanitized pass/fail messages, **not the rendered Compose
configuration**, because environment values could contain credentials.
If it prints `BLOCKED`, do **not** run the overlays with `up`. We must
inspect the conflicting configuration and revise the overlay first.

Even after this passes, switching the actual live TTS gateway/worker is a
**separate deployment and rollback operation** with possible brief service
interruption. No such operation is included here. GPU scheduling remains off.
