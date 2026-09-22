from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

ROOT = Path(os.getenv("TTS_DATA_ROOT", "/data")) / "voices"


def reference_path(voice_id: str) -> Path:
    safe = Path(voice_id).name
    if not safe or safe != voice_id:
        raise ValueError("Invalid voice_id.")
    path = ROOT / safe / "reference.wav"
    if not path.exists():
        raise ValueError(f"Voice profile '{voice_id}' was not found.")
    return path


def reference_text(voice_id: str) -> str | None:
    safe = Path(voice_id).name
    if not safe or safe != voice_id:
        raise ValueError("Invalid voice_id.")
    metadata_path = ROOT / safe / "metadata.json"
    if not metadata_path.exists():
        raise ValueError(f"Voice profile '{voice_id}' was not found.")
    metadata: dict[str, Any] = json.loads(
        metadata_path.read_text(encoding="utf-8")
    )
    value = str(metadata.get("reference_text") or "").strip()
    return value or None
