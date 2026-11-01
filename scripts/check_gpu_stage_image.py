"""Read-only coordinator credential and import check in freshly built images.

This runs in a disposable container with GPU scheduling disabled. No inference,
Redis lease keys, API ports, or existing Docker networks/services are changed.
"""
from __future__ import annotations

import importlib
import os
from pathlib import Path

service = os.getenv("GPU_PREFLIGHT_SERVICE", "")
if service not in {"tts", "media"}:
    raise SystemExit("Unknown GPU_PREFLIGHT_SERVICE")

if os.getenv("GPU_COORDINATION_ENABLED") != "false":
    raise SystemExit("Refusing to run preflight with coordination enabled")

if service == "tts":
    from gateway.gpu_client import create_gpu_redis_client
    module = importlib.import_module("gateway.app")
    if not hasattr(module, "app"):
        raise SystemExit("TTS gateway FastAPI app did not load")
    print("PASS: TTS gateway imports in the new image")
else:
    from media_service.gpu_client import create_gpu_redis_client
    module = importlib.import_module("media_service.jobs")
    if not hasattr(module, "run_media_job"):
        raise SystemExit("Media worker jobs module did not load")
    print("PASS: media worker imports in the new image")

# Ensure imports resolve from the baked image, not a temporary mounted directory.
module_path = Path(module.__file__).resolve()
if not module_path.is_relative_to(Path("/app")):
    raise SystemExit("Preflight imported application outside the built image")
print(f"PASS: {service} imports resolve from the built image")

client = create_gpu_redis_client()
try:
    if client.ping() is not True:
        raise SystemExit("Authenticated Redis PING failed")
finally:
    client.close()

print(f"PASS: {service} new image reads the mounted secret and authenticates")
print("PASS: GPU scheduling remained disabled; no inference was executed")
