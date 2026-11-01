# Controlled GPU coordination image rollout (flags OFF)

This playbook stages **deployment of the code only**. It does NOT activate
shared GPU scheduling. The next planned Compose recreation has a service
interruption risk. Run only during an approved quiet/maintenance window.

The separately tagged images that passed the GPU-host preflight are:

- TTS gateway: `voxora-gateway-coordination-preflight:20261101`
- GPU media worker: `voxora-media-coordination-preflight:20261101`

They include secret-file Redis client support and the new coordination code.
**All production coordination flags remain disabled.**

## Safety gate A — prepare a private rollback snapshot (NO restarts)

After this PR is merged and checked out on the GPU host:

```bash
cd /opt/voxora-gpu/video-director
bash scripts/prepare_gpu_coordination_rollout.sh
```

It checks the **actual untracked** `tts-service/docker-compose.gpu.yml`,
validates the live overlays with the safety comparator, verifies staged Docker
images exist, snapshots the running gateway and worker IDs, and privately
backs up their Compose files and local `.env` files under
`$HOME/voxora-gpu-rollout-XXXXXXXX` (directory mode 700; files mode 600).
It pins the **original** image IDs to
`voxora-gateway-rollback:<timestamp>` and
`voxora-media-rollback:<timestamp>` for later rollback.

These backups may contain tokens and passwords. Never paste, upload or commit
their contents. Do not delete the local original images or snapshot before
successful verification.

**This command does not deploy, restart, recreate, or join a service to a new
network.** The script prints the snapshot directory and confirms the running
container IDs/start times are unchanged.

## Safety gate B — confirm a safe maintenance window (operator-controlled)

- Keep `GPU_COORDINATION_ENABLED=false`,
  `GPU_MEDIA_WHISPER_DEVICE=cpu`,
  `GPU_MEDIA_HEAVY_ENABLED=false`.
- Confirm no TTS synthesis request is in flight. The existing TTS gateway
  does not yet expose an authoritative in-flight request counter, so select a
  known quiet window or stop new upstream submissions before a restart.
- Before restarting the RQ worker, verify **no active media jobs** and an
  acceptable queue/drain state. A worker restart mid-transcription can
  interrupt or retry an in-progress job; do not infer idleness from a
  container's healthy state alone.
- Record `curl -fsS http://172.31.64.234:8000/health` and media API
  health output. If those endpoints are not reachable from your current
  host, use their known private address; avoid public exposure.
- Do not modify production Redis queue, HF cache or artifact volumes.
- Do not use `docker compose down`, `--remove-orphans`, `-v`, or
  `docker image prune` in the rollout.

## Intended one-service-at-a-time rollout (NOT run by this PR)

When explicitly proceeding with a maintenance window, use an additional
**local, temporary image override** to select the already validated image.
Example structure for the TTS gateway override:

```yaml
services:
  gateway:
    image: voxora-gateway-coordination-preflight:20261101
```

The planned TTS command will combine:

```text
docker-compose.gpu.yml
docker-compose.coordination.yml
<local gateway image override>
```

and recreate **only the gateway** using `--no-deps --no-build`, then verify
`/health`, connectivity to all original engine workers, private Redis
connectivity, and a fresh low-risk test synthesis. There may be brief gateway
downtime during recreation. Qwen/Kokoro engine worker containers must remain
untouched.

After verifying TTS completely, select the media worker image with a
separate, local temporary override:

```yaml
services:
  worker:
    image: voxora-media-coordination-preflight:20261101
```

The planned worker command will recreate **only the RQ worker** with
`--no-deps --no-build`. Wait for the existing job to finish or safely stop
new work first. Verify the original `voxora-media` Redis queue remains
reachable and the worker listens on `voxora-gpu-media`; then test a short
queued CPU transcription.

**Do not apply these commands based only on this document**. The deployment
must first confirm current runtime image IDs, Compose project/service names,
queue status, backup paths, and any environment differences on the live host.
Compose may recreate containers even when the merged configuration is safe.

## Recovery plan

The snapshot manifest records the two previous image IDs and local rollback
tags. The prior **untracked** TTS base Compose and environment files remain
intact. To roll back an affected service, use the saved previous image as a
temporary `image:` override, combine it with the original base Compose
configuration **without** the coordination overlay, and recreate **only**
the affected gateway or worker after verifying the image exists.

Do not restore old secrets to a public path or paste them into logs. Do not
remove the coordinator network or Redis service while anything uses them.
Verify original gateway speech and media CPU transcription after rollback.

## Still blocking shared GPU scheduling activation

Even if the updated gateway and worker images run successfully with the flags
off, activating them introduces a new hazard: Redis lock loss cannot stop a
running CUDA kernel. Priority and safe interruption (or single-owner
supervision) must be implemented and validated. Long SDXL/Wan jobs can block
TTS; enable neither until resource profiles and admission/latency policy
are established.
