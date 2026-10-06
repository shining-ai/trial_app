from dataclasses import dataclass


@dataclass(frozen=True)
class VideoInfo:
    """ffprobe から読み取った動画の情報。幅・高さは回転を反映した表示サイズ。"""

    format_names: tuple[str, ...]
    has_video: bool
    duration_seconds: float | None
    width: int
    height: int
    fps_num: int
    fps_den: int
    has_audio: bool
    video_stream_index: int | None
    audio_stream_index: int | None
