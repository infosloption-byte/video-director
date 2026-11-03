"""Authenticated administrative job API. Never accessible directly by browsers."""
import hmac
import json
import os
import shutil
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field
from redis.exceptions import RedisError
from rq.job import Job
from rq.exceptions import NoSuchJobError
from rq.command import send_stop_job_command

from .config import (ARTIFACTS, JOB_QUEUE_TTL_SECONDS, JOB_RETENTION_SECONDS,
                     JOB_TIMEOUT_SECONDS, MAX_QUEUED_JOBS, MAX_UPLOAD_BYTES,
                     ROOT, auth_token, job_dir, queue, redis_connection)
from .sdxl_runtime import image_job_enabled, video_job_enabled

app = FastAPI(title="Voxora Private GPU Media Engine", version="0.1.0",
              docs_url=None, redoc_url=None, openapi_url=None)

class GenerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: str = Field(pattern=r"^(image|video)$")
    prompt: str = Field(min_length=12, max_length=1200)
    negative_prompt: str = Field(default="", max_length=300)

def require_auth(authorization: str | None = Header(default=None)):
    secret = auth_token()
    if not secret:
        raise HTTPException(503, "GPU Media Engine authentication is not configured.")
    candidate = authorization or ""
    if not hmac.compare_digest(candidate.encode(), ("Bearer " + secret).encode()):
        raise HTTPException(401, "Unauthorized.")

def get_job_or_404(job_id: str):
    try:
        job_dir(job_id)
        return Job.fetch(job_id, connection=redis_connection())
    except (ValueError, NoSuchJobError):
        raise HTTPException(404, "Job not found.")

def public_status(job):
    raw = job.get_status(refresh=True)
    status = raw.value if hasattr(raw, "value") else str(raw)
    if status in ("failed", "stopped") and job.meta.get("cancel_requested"):
        status = "canceled"
    output = {
        "id": job.id, "kind": job.meta.get("kind"), "status": status,
        "progress": int(job.meta.get("progress", 0)),
        "createdAt": job.created_at.isoformat() if job.created_at else None,
        "startedAt": job.started_at.isoformat() if job.started_at else None,
        "endedAt": job.ended_at.isoformat() if job.ended_at else None,
    }
    if status == "finished":
        output["result"] = job.return_value() or {}
        output["artifactUrl"] = "/v1/jobs/" + job.id + "/artifact"
    if status in ("failed", "stopped"):
        output["error"] = "Inference failed; inspect private worker logs."
    if job.meta.get("cancel_requested") and status not in ("canceled", "finished"):
        output["cancelRequested"] = True
    return output

def enqueue_job(kind: str, *, prompt=None, negative_prompt="", language=None, existing_id=None):
    connection = redis_connection()
    q = queue(connection)
    if q.count >= MAX_QUEUED_JOBS:
        raise HTTPException(429, "GPU media queue capacity reached.")
    job_id = existing_id or uuid.uuid4().hex
    folder = job_dir(job_id)
    if existing_id is not None:
        if not folder.is_dir() or not (folder / "input.audio").is_file():
            raise HTTPException(422, "Missing uploaded transcription input.")
    else:
        folder.mkdir(mode=0o700, parents=True, exist_ok=False)
    try:
        from .jobs import run_media_job
        job = q.enqueue(
            run_media_job, kind, {"prompt": prompt or "", "negative_prompt": negative_prompt,
                                  "language": language},
            job_id=job_id, job_timeout=JOB_TIMEOUT_SECONDS[kind],
            meta={"kind": kind, "progress": 0},
            ttl=JOB_QUEUE_TTL_SECONDS, result_ttl=JOB_RETENTION_SECONDS,
            failure_ttl=JOB_RETENTION_SECONDS, description="voxora-media-" + kind,
        )
        return public_status(job)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise

@app.get("/health")
def health():
    # Non-sensitive liveness only, never assert the GPU or queue is healthy.
    return {"ok": True, "service": "voxora-gpu-media"}

@app.get("/v1/status", dependencies=[Depends(require_auth)])
def status():
    try:
        connection = redis_connection()
        connection.ping()
        q = queue(connection)
        return {"ok": True, "queueDepth": q.count,
                "heavyJobsEnabled": os.getenv("GPU_MEDIA_HEAVY_ENABLED", "false").lower() == "true",
                "imageJobsEnabled": image_job_enabled(),
                "videoJobsEnabled": video_job_enabled()}
    except RedisError:
        raise HTTPException(503, "GPU media queue unavailable.")

@app.post("/v1/jobs", status_code=202, dependencies=[Depends(require_auth)])
def submit_generation(data: GenerationRequest):
    if data.kind == "image" and not image_job_enabled():
        raise HTTPException(409, "SDXL image jobs are disabled pending safe shared GPU scheduling.")
    if data.kind == "video" and not video_job_enabled():
        raise HTTPException(409, "GPU video jobs are not separately approved.")
    try:
        return enqueue_job(data.kind, prompt=data.prompt,
                           negative_prompt=data.negative_prompt)
    except RedisError:
        raise HTTPException(503, "GPU media queue unavailable.")

@app.post("/v1/transcriptions", status_code=202, dependencies=[Depends(require_auth)])
async def submit_transcription(file: UploadFile = File(...),
                               language: str | None = None):
    import re
    if language and not re.fullmatch(r"[a-z]{2,3}", language):
        raise HTTPException(422, "Invalid language code.")
    # File names supplied by users are deliberately ignored.
    job_id = uuid.uuid4().hex
    folder = job_dir(job_id)
    folder.mkdir(mode=0o700, parents=True, exist_ok=False)
    source = folder / "input.audio"
    size = 0
    try:
        with source.open("xb") as dest:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "Audio exceeds 25 MiB.")
                dest.write(chunk)
        if size < 128:
            raise HTTPException(422, "Audio file is too small.")
        return enqueue_job("transcription", language=language, existing_id=job_id)
    except Exception:
        shutil.rmtree(folder, ignore_errors=True)
        raise
    finally:
        await file.close()

@app.get("/v1/jobs/{job_id}", dependencies=[Depends(require_auth)])
def get_job(job_id: str):
    return public_status(get_job_or_404(job_id))

@app.post("/v1/jobs/{job_id}/cancel", dependencies=[Depends(require_auth)])
def cancel_job(job_id: str):
    job = get_job_or_404(job_id)
    state = public_status(job)["status"]
    if state in ("finished", "failed", "canceled"):
        return public_status(job)
    if state in ("queued", "deferred", "scheduled"):
        job.cancel()
    else:
        job.meta["cancel_requested"] = True
        job.save_meta()
        try:
            send_stop_job_command(redis_connection(), job.id)
        except Exception:
            # The job may have finished during the cancellation request.
            pass
    job.refresh()
    return public_status(job)

@app.get("/v1/jobs/{job_id}/artifact", dependencies=[Depends(require_auth)])
def download_artifact(job_id: str):
    job = get_job_or_404(job_id)
    if public_status(job)["status"] != "finished":
        raise HTTPException(409, "Artifact is not ready.")
    kind = job.meta.get("kind")
    if kind not in ARTIFACTS:
        raise HTTPException(404, "Artifact not found.")
    name, mime = ARTIFACTS[kind]
    path = job_dir(job_id) / name
    if not path.is_file() or path.is_symlink():
        raise HTTPException(404, "Artifact not found.")
    return FileResponse(path, media_type=mime, filename=name,
                        headers={"Cache-Control": "private, no-store",
                                 "X-Content-Type-Options": "nosniff"})
