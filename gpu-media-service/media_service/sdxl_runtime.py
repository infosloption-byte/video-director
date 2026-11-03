"""Fail-closed SDXL configuration for the isolated GPU media worker.

Model weights live in an existing, external Docker volume. No internet model
download is permitted for a production image job, and this module never
imports CUDA or constructs a pipeline during configuration checks.
"""
from __future__ import annotations

import os
from pathlib import Path

SDXL_MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
SDXL_CACHE_DIRECTORY = "models--stabilityai--stable-diffusion-xl-base-1.0"
# Portrait 9:16 is required by Website-to-Video, unlike the old 768x1024 demo.
SDXL_WIDTH = 576
SDXL_HEIGHT = 1024


def sdxl_model_options(env: dict | None = None) -> dict:
    source = os.environ if env is None else env
    raw = str(source.get("GPU_MEDIA_SDXL_CACHE_DIR", "")).strip()
    if not raw:
        raise RuntimeError("SDXL cache not configured; use the opt-in read-only cache overlay.")
    folder = Path(raw)
    if not folder.is_absolute() or not folder.is_dir():
        raise RuntimeError("SDXL cache directory is missing or not absolute.")
    model_cache = folder / SDXL_CACHE_DIRECTORY / "snapshots"
    if not model_cache.is_dir() or not any(entry.is_dir() for entry in model_cache.iterdir()):
        raise RuntimeError("SDXL cache is incomplete; no local model snapshot found.")
    return {"cache_dir": str(folder), "local_files_only": True}


def image_job_enabled(env: dict | None = None) -> bool:
    source = os.environ if env is None else env
    return all(str(source.get(key, "false")).lower() == "true" for key in (
        "GPU_MEDIA_HEAVY_ENABLED", "GPU_MEDIA_IMAGE_ENABLED", "GPU_COORDINATION_ENABLED"
    ))


def video_job_enabled(env: dict | None = None) -> bool:
    source = os.environ if env is None else env
    return all(str(source.get(key, "false")).lower() == "true" for key in (
        "GPU_MEDIA_HEAVY_ENABLED", "GPU_MEDIA_VIDEO_ENABLED", "GPU_COORDINATION_ENABLED"
    ))
