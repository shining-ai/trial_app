"""テストで動画の情報を調べる補助関数。"""

import json
import subprocess
from pathlib import Path


def probe(path: Path) -> dict:
    """ffprobe の format と streams を JSON で返す。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def video_stream(info: dict) -> dict:
    return next(s for s in info["streams"] if s["codec_type"] == "video")


def audio_streams(info: dict) -> list[dict]:
    return [s for s in info["streams"] if s["codec_type"] == "audio"]


def frame_timestamps(path: Path) -> list[float]:
    """映像の各フレームの表示時刻(秒)を返す。"""
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "frame=pts_time", "-of", "csv=p=0", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return [float(line.strip(",")) for line in result.stdout.split() if line.strip(",")]
