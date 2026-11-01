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

## Gateway-only rollout planning check (NO deployment)

After the protected snapshot has been created, use the planning script to
produce **private image-only Compose overrides** for the new gateway and its
previous image. This is a dry run and makes no Docker service changes.

```bash
cd /opt/voxora-gpu/video-director
python3 -m unittest discover -s scripts/tests -p 'test_gpu_gateway_override.py' -v
bash scripts/plan_gpu_gateway_rollout.sh /home/ubuntu/voxora-gpu-rollout-faOcjeMQ
```

The planner requires the live TTS base Compose file and environment to match
their protected copies, the gateway and media worker to have the **same**
container IDs and image IDs as the snapshot, the coordinator to remain healthy,
and the original gateway rollback image tag to point to the original image ID.

It then creates two mode-600 files inside the protected snapshot:

- `gateway-new-image.override.yml` — the separately tested new gateway image.
- `gateway-rollback-image.override.yml` — the original gateway image.

It renders both complete intended Compose configurations without printing the
environment values. The checker rejects any unexpected changes to non-gateway
services, networks, ports, volumes, environment or dependencies.

**This stage does not recreate the gateway.** Do not run an `up` command in
response to a planner pass alone. First choose a maintenance window, drain
incoming TTS work, and verify the live image/Compose state has not changed.
The gateway will have a short outage if later recreated, even when the
scheduler is disabled.

A later operator-controlled deployment will combine the current untracked TTS
base Compose, the coordination overlay and the private new-image override,
targeting only `gateway` with `--no-deps --no-build`. If it fails health
or synthesis checks, rollback should combine the original TTS base Compose
**without the coordination overlay** and the private rollback image override.
No TTS engine or media worker should be recreated in either case.

## Stage 10: controlled TTS gateway-only deployment (explicit operator action)

Once the protected gateway rollout plan and staging checks pass, the
gateway can be updated **without changing the engine workers or media
worker**. The script defaults to a read-only check.

After merging the rollout-script pull request:

```bash
cd /opt/voxora-gpu/video-director
bash -n scripts/rollout_gpu_gateway.sh
bash scripts/rollout_gpu_gateway.sh check /home/ubuntu/voxora-gpu-rollout-faOcjeMQ
```

This confirms that the original gateway and media worker still match the
saved snapshot, the original gateway image tag still points to the correct
rollback image, and the proposed Compose overrides remain valid.

**Only in a confirmed TTS maintenance window**, after temporarily stopping
new upstream TTS submissions and confirming no synthesis is in flight, run:

```bash
cd /opt/voxora-gpu/video-director
bash scripts/rollout_gpu_gateway.sh deploy \
  /home/ubuntu/voxora-gpu-rollout-faOcjeMQ \
  --accept-tts-interruption
```

The script will ask for `DEPLOY-GATEWAY` interactively. It
then recreates **only** service `gateway` with its existing
live base Compose, the disabled coordination overlay, and the already tested
gateway image. It uses `--no-deps --no-build --force-recreate`.
A brief outage is expected; no availability promise is made.

Checks after recreation: new gateway image ID, Redis password mount, GPU
coordination still OFF, internal DNS resolution for all four TTS engine workers,
authenticated connectivity to the coordinator, gateway `/health`,
unchanged engine container IDs and unchanged media worker ID.

If deployment or checks fail, the script attempts automatic rollback to the
**original image plus base-only Compose**. If rollback fails, investigate
immediately and use the private snapshot. The script does not print credentials.

At any later point, an explicit manual rollback can be attempted:

```bash
bash scripts/rollout_gpu_gateway.sh rollback \
  /home/ubuntu/voxora-gpu-rollout-faOcjeMQ
```

**Important:** A green `/health` and Redis/DNS check do not
prove end-to-end narration. After successful deployment, send a controlled
authenticated Kokoro synthesis request through the existing application and,
where safe, verify voice cloning or Qwen separately. Do not restart or
replace the media worker until gateway behavior is verified.

Keep `GPU_COORDINATION_ENABLED=false` throughout. No GPU
Whisper, SDXL or Wan workload is enabled by this step. Redis lease loss
during a native CUDA call and TTS prioritization remain unaddressed.
