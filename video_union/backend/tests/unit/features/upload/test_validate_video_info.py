import pytest

from app.features.upload.validate_video_info import validate_video_info
from app.features.upload.video_info import VideoInfo
from app.lib.config import Settings

SETTINGS = Settings()
NOT_A_VIDEO = ("not_a_video", "動画として読み込めませんでした")


def _info(width=1920, height=1080, duration=2.0, has_video=True, formats=("mov", "mp4", "m4a", "3gp", "3g2", "mj2"),
          fps_num=30):
    return VideoInfo(format_names=formats, has_video=has_video, duration_seconds=duration, width=width,
                     height=height, fps_num=fps_num, fps_den=1, has_audio=True, video_stream_index=0,
                     audio_stream_index=1)


def _result(info):
    failure = validate_video_info(info, SETTINGS)
    return None if failure is None else (failure.code, failure.message)


@pytest.mark.parametrize("formats", [
    ("mov", "mp4", "m4a", "3gp", "3g2", "mj2"), ("matroska", "webm"), ("avi",), ("mpegts",), ("mpeg",), ("asf",), ("flv",),
])
def test_allowed_container_formats_are_accepted(formats):
    assert _result(_info(formats=formats)) is None


@pytest.mark.parametrize("formats", [
    ("png_pipe",), ("image2",), ("gif",), ("apng",), ("webp_pipe",), ("hls",), ("concat",), ("mp3",),
])
def test_other_formats_are_rejected_as_not_a_video(formats):
    assert _result(_info(formats=formats)) == NOT_A_VIDEO


def test_landscape_4k_exactly_is_accepted_and_one_pixel_over_is_rejected():
    assert _result(_info(3840, 2160)) is None
    assert _result(_info(3841, 2160)) == ("resolution_too_large", "解像度 3841x2160 は上限 3840x2160 を超えています")
    assert _result(_info(3840, 2161)) == ("resolution_too_large", "解像度 3840x2161 は上限 3840x2160 を超えています")


def test_portrait_4k_exactly_is_accepted_and_one_pixel_over_shows_portrait_limit():
    assert _result(_info(2160, 3840)) is None
    assert _result(_info(2160, 3841)) == ("resolution_too_large", "解像度 2160x3841 は上限 2160x3840 を超えています")


def test_square_is_judged_by_short_side():
    assert _result(_info(2160, 2160)) is None
    assert _result(_info(2161, 2161)) == ("resolution_too_large", "解像度 2161x2161 は上限 3840x2160 を超えています")


def test_zero_or_missing_duration_is_rejected_and_tiny_positive_is_accepted():
    assert _result(_info(duration=0.0)) == NOT_A_VIDEO
    assert _result(_info(duration=None)) == NOT_A_VIDEO
    assert _result(_info(duration=0.001)) is None


def test_file_without_video_stream_is_rejected():
    assert _result(_info(has_video=False)) == NOT_A_VIDEO


def test_limits_come_from_settings():
    small = Settings(max_long_side=640, max_short_side=360)

    assert validate_video_info(_info(640, 360), small) is None
    assert validate_video_info(_info(641, 360), small).message == "解像度 641x360 は上限 640x360 を超えています"


@pytest.mark.parametrize("duration", [float("nan"), float("inf")])
def test_non_finite_duration_is_rejected(duration):
    assert _result(_info(duration=duration)) == NOT_A_VIDEO


def test_zero_frame_rate_or_zero_size_is_rejected():
    assert _result(_info(fps_num=0)) == NOT_A_VIDEO
    assert _result(_info(width=0, height=360)) == NOT_A_VIDEO
    assert _result(_info(width=640, height=0)) == NOT_A_VIDEO
