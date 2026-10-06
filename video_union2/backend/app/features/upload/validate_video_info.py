from dataclasses import dataclass

from app.features.upload.video_info import VideoInfo
from app.lib.config import Settings
from app.lib.media_input_policy import is_allowed_format


@dataclass(frozen=True)
class ValidationFailure:
    code: str
    message: str


_NOT_A_VIDEO = ValidationFailure("not_a_video", "動画として読み込めませんでした")


def validate_video_info(info: VideoInfo, settings: Settings) -> ValidationFailure | None:
    """動画として受け付けられるかを判定し、受け付けられないときは理由を返す。"""
    if not is_allowed_format(info.format_names) or not info.has_video:
        return _NOT_A_VIDEO
    if info.duration_seconds is None or info.duration_seconds <= 0:
        return _NOT_A_VIDEO

    long_side, short_side = max(info.width, info.height), min(info.width, info.height)
    if long_side > settings.max_long_side or short_side > settings.max_short_side:
        is_landscape = info.width >= info.height
        limit_w, limit_h = (
            (settings.max_long_side, settings.max_short_side) if is_landscape
            else (settings.max_short_side, settings.max_long_side)
        )
        return ValidationFailure(
            "resolution_too_large",
            f"解像度 {info.width}x{info.height} は上限 {limit_w}x{limit_h} を超えています",
        )
    return None
