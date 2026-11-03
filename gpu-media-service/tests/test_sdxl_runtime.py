"""No CUDA/download/Redis required for SDXL staging checks."""
from pathlib import Path

import pytest

from media_service.sdxl_runtime import (
    SDXL_HEIGHT, SDXL_WIDTH, image_job_enabled,
    sdxl_model_options, video_job_enabled,
)


def test_sdxl_outputs_vertical_portrait_for_storyboard():
    assert (SDXL_WIDTH, SDXL_HEIGHT) == (576, 1024)
    assert SDXL_WIDTH * 16 == SDXL_HEIGHT * 9


def test_sdxl_model_cache_requires_existing_local_snapshot(tmp_path):
    with pytest.raises(RuntimeError, match="cache not configured"):
        sdxl_model_options({})
    with pytest.raises(RuntimeError, match="missing"):
        sdxl_model_options({"GPU_MEDIA_SDXL_CACHE_DIR": str(tmp_path / "missing")})
    with pytest.raises(RuntimeError, match="incomplete"):
        sdxl_model_options({"GPU_MEDIA_SDXL_CACHE_DIR": str(tmp_path)})
    snapshot = tmp_path / "models--stabilityai--stable-diffusion-xl-base-1.0" / "snapshots" / "test-sha"
    snapshot.mkdir(parents=True)
    assert sdxl_model_options({"GPU_MEDIA_SDXL_CACHE_DIR": str(tmp_path)}) == {
        "cache_dir": str(tmp_path), "local_files_only": True,
    }


def test_sdxl_rejects_partial_activation_and_does_not_enable_video():
    baseline = {"GPU_MEDIA_HEAVY_ENABLED": "true",
                "GPU_MEDIA_IMAGE_ENABLED": "true"}
    assert not image_job_enabled(baseline)
    baseline["GPU_COORDINATION_ENABLED"] = "true"
    assert image_job_enabled(baseline)
    assert not video_job_enabled(baseline)
    baseline["GPU_MEDIA_VIDEO_ENABLED"] = "true"
    assert video_job_enabled(baseline)
    assert not image_job_enabled({})
