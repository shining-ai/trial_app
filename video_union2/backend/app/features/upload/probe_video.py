import json
from pathlib import Path

from app.features.upload.build_probe_args import build_probe_args
from app.lib.run_process import run_process


async def probe_video(path: Path, timeout_seconds: float) -> dict:
    """ffprobe を実行し、format と streams の JSON を返す。"""
    lines: list[str] = []
    await run_process(build_probe_args(path), timeout_seconds=timeout_seconds, on_stdout_line=lines.append)
    return json.loads("\n".join(lines))
