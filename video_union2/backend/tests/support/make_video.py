"""テスト用の動画を FFmpeg で作る補助関数。"""

import subprocess
from pathlib import Path

# 入れ物ごとの映像・音声のエンコーダー
_CODECS = {
    "mp4": (["-c:v", "libx264", "-pix_fmt", "yuv420p"], ["-c:a", "aac"]),
    "webm": (["-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8"], ["-c:a", "libopus"]),
    "mkv": (["-c:v", "mpeg4"], ["-c:a", "aac"]),
}


def make_video(
    path: Path,
    *,
    width: int = 320,
    height: int = 180,
    duration: float = 1.0,
    fps: str = "30",
    color: str | None = "red",
    audio: bool = True,
    rotation: int | None = None,
    container: str = "mp4",
    variable_frame_rate: bool = False,
) -> Path:
    """指定した条件の動画を path に作り、path を返す。

    color を None にすると、動きのあるテストパターン(testsrc2)になる。
    rotation を指定すると、表示時の回転情報(displaymatrix)を付ける。
    variable_frame_rate を True にすると、フレームの間隔が一定でない動画になる。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    video_codec, audio_codec = _CODECS[container]
    if color is None:
        source = f"testsrc2=s={width}x{height}:r={fps}:d={duration}"
    else:
        source = f"color=c={color}:s={width}x{height}:r={fps}:d={duration}"

    args = ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", source]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:sample_rate=44100:duration={duration}"]
    if variable_frame_rate:
        # 前半はすべてのフレーム、後半は3枚に1枚だけ残し、元の時刻を保ったまま書き出す
        args += ["-vf", "select='lt(n\\,15)+not(mod(n\\,3))'", "-fps_mode", "vfr"]
    args += video_codec
    if audio:
        args += audio_codec + ["-shortest"]

    if rotation is None:
        args.append(str(path))
        _run(args)
        return path

    unrotated = path.with_name(f"unrotated-{path.name}")
    args.append(str(unrotated))
    _run(args)
    _run(["ffmpeg", "-y", "-v", "error", "-display_rotation", str(rotation), "-i", str(unrotated), "-c", "copy", str(path)])
    unrotated.unlink()
    return path


def make_still_png(path: Path, *, width: int = 320, height: int = 180) -> Path:
    """静止画の PNG を作る。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    _run(["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", f"color=c=red:s={width}x{height}", "-frames:v", "1", str(path)])
    return path


def _run(args: list[str]) -> None:
    subprocess.run(args, check=True, capture_output=True)
