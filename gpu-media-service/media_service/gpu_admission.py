"""Conservative GPU VRAM admission, independent from CUDA/model imports.

This is a preflight check, not a hard memory reservation. All participating
services must acquire the cross-process lease before calling this function.
"""
from __future__ import annotations
import os
import subprocess

class GPUAdmissionDenied(RuntimeError):
    pass

def required_free_mib(kind: str) -> int:
    defaults = {"transcription": 2048, "image": 10240, "video": 14336}
    if kind not in defaults:
        raise GPUAdmissionDenied("Unsupported GPU workload type.")
    env = os.getenv("GPU_MEDIA_MIN_FREE_MIB_" + kind.upper(), str(defaults[kind]))
    try:
        value = int(env)
    except ValueError as exc:
        raise GPUAdmissionDenied("Invalid GPU free-memory threshold.") from exc
    if value < 256:
        raise GPUAdmissionDenied("GPU threshold cannot be lower than 256 MiB.")
    return value

def gpu_free_memory_mib() -> int:
    try:
        output = subprocess.run(
            ["nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits", "-i", "0"],
            capture_output=True, text=True, check=True, timeout=5,
        ).stdout.strip()
        return int(output.splitlines()[0].strip())
    except (OSError, ValueError, IndexError, subprocess.SubprocessError) as exc:
        raise GPUAdmissionDenied("GPU memory telemetry is unavailable.") from exc

def assert_gpu_admitted(kind: str) -> int:
    minimum = required_free_mib(kind)
    available = gpu_free_memory_mib()
    if available < minimum:
        raise GPUAdmissionDenied(
            f"GPU admission denied for {kind}: {available} MiB free, {minimum} MiB required."
        )
    return available
