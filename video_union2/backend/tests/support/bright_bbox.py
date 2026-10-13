"""動画の指定時刻のフレームで、明るい画素の外接矩形を求める補助関数。"""

import subprocess
from pathlib import Path

from tests.support.probe import probe, video_stream


def bright_bbox(path: Path, *, at_seconds: float, threshold: int = 128) -> tuple[int, int, int, int] | None:
    """at_seconds のフレームで、R・G・B のどれかが threshold を超える画素の外接矩形を返す。

    返す値は (left, top, right, bottom) で、right と bottom は含む座標。明るい画素がなければ None。
    """
    video = video_stream(probe(path))
    width, height = video["width"], video["height"]
    result = subprocess.run(
        [
            "ffmpeg", "-v", "error", "-ss", str(at_seconds), "-i", str(path),
            "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        check=True,
        capture_output=True,
    )
    pixels = result.stdout
    row_bytes = width * 3
    if len(pixels) != row_bytes * height:
        raise ValueError("フレームの大きさが動画の幅と高さに合いません")

    left = top = None
    right = bottom = -1
    for y in range(height):
        row = pixels[y * row_bytes:(y + 1) * row_bytes]
        for x in range(width):
            if max(row[x * 3:x * 3 + 3]) > threshold:
                if left is None or x < left:
                    left = x
                if top is None:
                    top = y
                right = max(right, x)
                bottom = y
    if left is None:
        return None
    return left, top, right, bottom
