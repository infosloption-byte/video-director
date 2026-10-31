"""API tests use a fake queue; no GPU, Redis or cloud inference required."""
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

import media_service.api as api
import media_service.jobs as jobs

class FakeJob:
    def __init__(self, job_id, meta):
        self.id = job_id
        self.meta = meta
        self.created_at = datetime.now(timezone.utc)
        self.started_at = None
        self.ended_at = None
        self._status = "queued"

    def get_status(self, refresh=True):
        return self._status

    def return_value(self):
        return None

    def cancel(self):
        self._status = "canceled"

    def refresh(self):
        pass

class FakeQueue:
    def __init__(self):
        self.count = 0
        self.jobs = {}

    def enqueue(self, fn, kind, args, **options):
        assert fn == jobs.run_media_job
        assert options["job_timeout"] >= 900
        assert options["meta"]["kind"] == kind
        job = FakeJob(options["job_id"], options["meta"])
        self.jobs[job.id] = job
        return job

@pytest.fixture
def setup(monkeypatch, tmp_path):
    q = FakeQueue()
    monkeypatch.setenv("GPU_MEDIA_AUTH_TOKEN", "test-only-very-long-admin-secret")
    monkeypatch.setenv("GPU_MEDIA_HEAVY_ENABLED", "false")
    monkeypatch.setattr(api, "job_dir", lambda job_id: tmp_path / job_id)
    monkeypatch.setattr(api, "redis_connection", lambda: object())
    monkeypatch.setattr(api, "queue", lambda conn=None: q)
    monkeypatch.setattr(api, "get_job_or_404", lambda id: q.jobs[id])
    return TestClient(api.app), q, tmp_path

def headers():
    return {"Authorization": "Bearer test-only-very-long-admin-secret"}

def test_fails_closed_without_auth(setup, monkeypatch):
    client, _, _ = setup
    response = client.post("/v1/jobs", json={"kind": "image", "prompt": "An ocean container port at dawn."})
    assert response.status_code == 401
    response = client.post("/v1/jobs", headers={"Authorization": "Bearer invalid"},
                           json={"kind": "video", "prompt": "An ocean container port at dawn."})
    assert response.status_code == 401
    monkeypatch.delenv("GPU_MEDIA_AUTH_TOKEN")
    response = client.post("/v1/jobs", headers=headers(),
                           json={"kind": "image", "prompt": "An ocean container port at dawn."})
    assert response.status_code == 503

def test_generation_queued_without_starting_gpu(setup, monkeypatch):
    monkeypatch.setenv("GPU_MEDIA_HEAVY_ENABLED", "true")
    client, q, root = setup
    result = client.post("/v1/jobs", headers=headers(), json={
        "kind": "video", "prompt": "Documentary footage of cargo ships entering a port."})
    assert result.status_code == 202, result.text
    item = result.json()
    assert item["status"] == "queued"
    assert item["kind"] == "video"
    assert len(item["id"]) == 32
    assert (root / item["id"]).is_dir()
    assert not any((root / item["id"]).iterdir())

def test_validation_rejects_injected_fields(setup):
    client, _, root = setup
    for body in [
        {"kind": "image", "prompt": "x"},
        {"kind": "video", "prompt": "A safe phrase with enough text.", "model": "untrusted"},
        {"kind": "research", "prompt": "A safe phrase with enough text."},
    ]:
        response = client.post("/v1/jobs", headers=headers(), json=body)
        assert response.status_code == 422

def test_audio_upload_enqueues_existing_private_directory(setup):
    client, q, root = setup
    body = b"RIFF" + b"\x00" * 1024  # ffprobe rejects it later in worker; upload gate is size-limited
    response = client.post("/v1/transcriptions", headers=headers(),
                           files={"file": ("../../etc/passwd", body, "audio/wav")})
    assert response.status_code == 202, response.text
    item = response.json()
    assert (root / item["id"] / "input.audio").read_bytes() == body
    assert sorted(p.name for p in (root / item["id"]).iterdir()) == ["input.audio"]

def test_media_api_cancel_queued_job(setup, monkeypatch):
    monkeypatch.setenv("GPU_MEDIA_HEAVY_ENABLED", "true")
    client, q, _ = setup
    response = client.post("/v1/jobs", headers=headers(), json={
        "kind": "image", "prompt": "Cinematic mountain valley at sunrise."})
    id = response.json()["id"]
    canceled = client.post("/v1/jobs/" + id + "/cancel", headers=headers())
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "canceled"

def test_heavy_api_requires_explicit_opt_in(setup):
    client, q, _ = setup
    denied = client.post("/v1/jobs", headers=headers(), json={
        "kind": "image", "prompt": "Documentary view of a busy container port."})
    assert denied.status_code == 409
    assert not q.jobs

def test_heavy_jobs_are_disabled_by_default(setup, tmp_path):
    with pytest.raises(RuntimeError, match="disabled"):
        jobs.image_generate(tmp_path / "image.png", "a valid prompt", "")
    with pytest.raises(RuntimeError, match="disabled"):
        jobs.video_generate(tmp_path / "video.mp4", "a valid prompt", "")
