"""Durable RQ worker functions. One worker process = one inference job at a time."""
import json
import os
import subprocess
import time
from contextlib import contextmanager
from redis import Redis
from .gpu_lease import GPULease, LeaseUnavailable
from .gpu_admission import assert_gpu_admitted
from pathlib import Path

from rq import get_current_job

from .config import ARTIFACTS, job_dir

def progress(value: int):
    job = get_current_job()
    if job:
        job.meta["progress"] = min(99, max(0, int(value)))
        job.save_meta()

def transcribe(job_id: str, input_path: Path, output_path: Path, language: str | None):
    # Verify the media content and duration before invoking Whisper.
    command = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
               "-of", "default=noprint_wrappers=1:nokey=1", str(input_path)]
    result = subprocess.run(command, capture_output=True, text=True, timeout=20, check=True)
    duration = float(result.stdout.strip())
    if not 0.1 <= duration <= 300.0:
        raise ValueError("Audio must be between 0.1 and 300 seconds.")
    progress(10)

    from faster_whisper import WhisperModel
    model = WhisperModel(
        "small",
        device=os.getenv("GPU_MEDIA_WHISPER_DEVICE", "cpu"),
        compute_type=os.getenv("GPU_MEDIA_WHISPER_COMPUTE_TYPE", "int8"),
        cpu_threads=2,
    )
    progress(35)
    segments, info = model.transcribe(
        str(input_path), language=language, beam_size=3, vad_filter=True,
        condition_on_previous_text=False,
    )
    items = []
    for seg in segments:
        items.append({"start": round(seg.start, 3), "end": round(seg.end, 3),
                      "text": seg.text.strip()})
        if len(items) > 1000:
            raise ValueError("Too many transcript segments.")
    transcript = {"language": info.language, "durationSeconds": round(duration, 3),
                  "segments": items, "text": " ".join(s["text"] for s in items)}
    temp = output_path.with_suffix(".json.partial")
    temp.write_text(json.dumps(transcript, ensure_ascii=False), encoding="utf-8")
    os.replace(temp, output_path)
    progress(95)
    return {"engine": "faster-whisper-small", "language": info.language,
            "durationSeconds": round(duration, 3), "segmentCount": len(items)}

def image_generate(output_path: Path, prompt: str, negative: str):
    if os.getenv("GPU_MEDIA_HEAVY_ENABLED", "false").lower() != "true":
        raise RuntimeError("GPU heavy jobs are disabled until coordinated TTS scheduling is enabled.")
    import torch
    from diffusers import StableDiffusionXLPipeline
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable.")
    progress(5)
    pipe = StableDiffusionXLPipeline.from_pretrained(
        "stabilityai/stable-diffusion-xl-base-1.0",
        torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_slicing()
    progress(35)
    def on_step(pipeline, step, timestep, kwargs):
        if step % 5 == 0:
            progress(35 + int((step + 1) * 50 / 20))
        return kwargs
    with torch.inference_mode():
        result = pipe(
            prompt=prompt, negative_prompt=negative,
            width=768, height=1024, num_inference_steps=20,
            guidance_scale=7.0, generator=torch.Generator(device="cpu").manual_seed(42),
            callback_on_step_end=on_step,
        ).images[0]
    tmp = output_path.with_name("image.partial.png")
    result.save(tmp, format="PNG")
    os.replace(tmp, output_path)
    progress(95)
    return {"engine": "sdxl-base-1.0", "width": 768, "height": 1024,
            "peakPyTorchGiB": round(torch.cuda.max_memory_allocated() / (1024**3), 2)}

def video_generate(output_path: Path, prompt: str, negative: str):
    if os.getenv("GPU_MEDIA_HEAVY_ENABLED", "false").lower() != "true":
        raise RuntimeError("GPU heavy jobs are disabled until coordinated TTS scheduling is enabled.")
    import torch
    from diffusers import AutoencoderKLWan, WanPipeline, UniPCMultistepScheduler
    from diffusers.utils import export_to_video
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable.")
    progress(5)
    model_id = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
    vae = AutoencoderKLWan.from_pretrained(model_id, subfolder="vae",
                                           torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(model_id, vae=vae, torch_dtype=torch.float16)
    pipe.scheduler = UniPCMultistepScheduler.from_config(pipe.scheduler.config, flow_shift=5.0)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    progress(40)
    with torch.inference_mode():
        frames = pipe(
            prompt=prompt, negative_prompt=negative,
            width=832, height=480, num_frames=33, num_inference_steps=20,
            guidance_scale=5.0, generator=torch.Generator(device="cpu").manual_seed(42),
        ).frames[0]
    progress(90)
    tmp = output_path.with_name("video.partial.mp4")
    export_to_video(frames, str(tmp), fps=16)
    os.replace(tmp, output_path)
    progress(95)
    return {"engine": "wan2.1-t2v-1.3b", "frames": 33, "fps": 16,
            "width": 832, "height": 480,
            "peakPyTorchGiB": round(torch.cuda.max_memory_allocated() / (1024**3), 2)}

@contextmanager
def gpu_reservation(kind: str):
    # CPU jobs never require a GPU lease; GPU jobs fail closed when opted in.
    gpu_job = kind in ("image", "video") or (
        kind == "transcription" and os.getenv("GPU_MEDIA_WHISPER_DEVICE", "cpu") == "cuda"
    )
    if not gpu_job:
        yield None
        return
    if os.getenv("GPU_COORDINATION_ENABLED", "false").lower() != "true":
        raise LeaseUnavailable("GPU jobs require enabled shared coordination.")
    url = os.getenv("GPU_COORDINATION_REDIS_URL", "")
    if not url:
        raise LeaseUnavailable("GPU coordinator URL is missing.")
    client = Redis.from_url(url, socket_connect_timeout=3, socket_timeout=3)
    lease = GPULease(client)
    try:
        lease.acquire(wait_seconds=15)
        lease.assert_held()
        assert_gpu_admitted(kind)
        yield lease
        lease.assert_held()
    finally:
        if lease._acquired:
            lease.release()
        client.close()

def run_media_job(kind: str, arguments: dict):
    job = get_current_job()
    if job is None:
        raise RuntimeError("GPU inference job must be dispatched by RQ.")
    if kind not in ARTIFACTS or job.meta.get("kind") != kind:
        raise ValueError("Invalid or mismatched job type.")
    folder = job_dir(job.id)
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    artifact_name, _ = ARTIFACTS[kind]
    output = folder / artifact_name
    start = time.monotonic()
    with gpu_reservation(kind):
        if kind == "transcription":
            result = transcribe(job.id, folder / "input.audio", output, arguments.get("language"))
            (folder / "input.audio").unlink(missing_ok=True)
        elif kind == "image":
            result = image_generate(output, arguments["prompt"], arguments.get("negative_prompt") or "")
        elif kind == "video":
            result = video_generate(output, arguments["prompt"], arguments.get("negative_prompt") or "")
        else:
            raise ValueError("Unknown media job.")
    if not output.is_file() or output.stat().st_size < 10:
        raise RuntimeError("Inference reported success without an artifact.")
    progress(99)
    return {**result, "elapsedSeconds": round(time.monotonic() - start, 2),
            "artifactBytes": output.stat().st_size}
