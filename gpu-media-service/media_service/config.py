"""Shared settings. All public operations require explicit authentication."""
import os
from pathlib import Path

from redis import Redis
from rq import Queue

ROOT = Path(os.getenv("GPU_MEDIA_DATA_ROOT", "/media/jobs")).resolve()
REDIS_URL = os.getenv("GPU_MEDIA_REDIS_URL", "redis://redis:6379/0")
QUEUE_NAME = "voxora-gpu-media"
MAX_QUEUED_JOBS = 20
MAX_UPLOAD_BYTES = 25 * 1024 * 1024
JOB_RETENTION_SECONDS = 24 * 3600
JOB_QUEUE_TTL_SECONDS = 6 * 3600
JOB_TIMEOUT_SECONDS = {"transcription": 900, "image": 1800, "video": 3600}
ARTIFACTS = {"transcription": ("transcription.json", "application/json"),
             "image": ("image.png", "image/png"), "video": ("video.mp4", "video/mp4")}

def redis_connection():
    return Redis.from_url(REDIS_URL, socket_connect_timeout=5, socket_timeout=10)

def queue(connection=None):
    return Queue(QUEUE_NAME, connection=connection or redis_connection(),
                 default_timeout=3600)

def job_dir(job_id: str) -> Path:
    # All job ids are created by this application. Reject arbitrary caller inputs.
    import re
    if not re.fullmatch(r"[0-9a-f]{32}", job_id):
        raise ValueError("Invalid job id.")
    return ROOT / job_id

def auth_token() -> str:
    return os.getenv("GPU_MEDIA_AUTH_TOKEN", "").strip()
