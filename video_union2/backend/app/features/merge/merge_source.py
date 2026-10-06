from dataclasses import dataclass


@dataclass(frozen=True)
class MergeSource:
    """結合の入力になる動画。幅・高さは表示サイズ、fps は分数で持つ。"""

    video_id: str
    file_name: str
    size_bytes: int
    duration_seconds: float
    width: int
    height: int
    fps_num: int
    fps_den: int
    has_audio: bool
