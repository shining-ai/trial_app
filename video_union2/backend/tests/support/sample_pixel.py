"""動画の指定時刻のフレームから、指定座標の色を取り出す補助関数。"""

import subprocess
from pathlib import Path


def sample_pixel(path: Path, *, at_seconds: float, x: int, y: int) -> tuple[int, int, int]:
    """at_seconds のフレームの (x, y) の RGB を返す。"""
    result = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", str(at_seconds), "-i", str(path),
            "-frames:v", "1", "-vf", f"crop=2:2:{x}:{y}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        check=True,
        capture_output=True,
    )
    r, g, b = result.stdout[:3]
    return r, g, b


def is_close(actual: tuple[int, int, int], expected: tuple[int, int, int], tolerance: int = 40) -> bool:
    """圧縮による色のずれを許して、2つの色が近いかを判定する。"""
    return all(abs(a - e) <= tolerance for a, e in zip(actual, expected))
