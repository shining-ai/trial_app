import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    storage_dir: Path = Path("/data")
    max_upload_bytes: int = 4 * 1024**3
    max_long_side: int = 3840
    max_short_side: int = 2160
    stale_file_hours: int = 24
    ffprobe_timeout_seconds: int = 60
    max_videos: int = 100
    max_total_seconds: int = 1800
    max_fps: int = 60
    x264_preset: str = "veryfast"
    x264_crf: int = 20
    ffmpeg_timeout_per_second: int = 20
    scene_font_path: Path = Path("/usr/share/fonts/opentype/ipaexfont-gothic/ipaexg.ttf")

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> "Settings":
        """環境変数から設定を作る。指定のない項目は既定値になる。"""
        env = os.environ if environ is None else environ
        defaults = cls()
        return cls(
            storage_dir=Path(env.get("STORAGE_DIR", str(defaults.storage_dir))),
            max_upload_bytes=_int(env, "MAX_UPLOAD_BYTES", defaults.max_upload_bytes),
            max_long_side=_int(env, "MAX_LONG_SIDE", defaults.max_long_side),
            max_short_side=_int(env, "MAX_SHORT_SIDE", defaults.max_short_side),
            stale_file_hours=_int(env, "STALE_FILE_HOURS", defaults.stale_file_hours),
            ffprobe_timeout_seconds=_int(env, "FFPROBE_TIMEOUT_SECONDS", defaults.ffprobe_timeout_seconds),
            max_videos=_int(env, "MAX_VIDEOS", defaults.max_videos),
            max_total_seconds=_int(env, "MAX_TOTAL_SECONDS", defaults.max_total_seconds),
            max_fps=_int(env, "MAX_FPS", defaults.max_fps),
            x264_preset=env.get("X264_PRESET", defaults.x264_preset),
            x264_crf=_int(env, "X264_CRF", defaults.x264_crf),
            ffmpeg_timeout_per_second=_int(env, "FFMPEG_TIMEOUT_PER_SECOND", defaults.ffmpeg_timeout_per_second),
            scene_font_path=Path(env.get("SCENE_FONT_PATH", str(defaults.scene_font_path))),
        )


def _int(env: Mapping[str, str], name: str, default: int) -> int:
    if name not in env:
        return default
    try:
        return int(env[name])
    except ValueError as e:
        raise ValueError(f"環境変数 {name} は整数で指定してください") from e
