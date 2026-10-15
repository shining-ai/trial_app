from pathlib import Path

from app.features.upload.build_thumbnail_args import build_thumbnail_args
from app.lib.media_input_policy import ALLOWED_FORMATS


def test_thumbnail_args_take_one_frame_from_start_and_shrink_into_240x135():
    args = build_thumbnail_args(Path("/data/uploads/a.bin"), Path("/data/uploads/a.jpg"), video_stream_index=0)

    assert args == [
        "ffmpeg", "-y", "-nostdin", "-v", "error",
        "-protocol_whitelist", "file", "-format_whitelist", ",".join(ALLOWED_FORMATS),
        "-i", "/data/uploads/a.bin",
        "-map", "0:0",
        "-frames:v", "1",
        "-vf", "scale=240:135:force_original_aspect_ratio=decrease",
        "-q:v", "4",
        "-f", "image2", "-update", "1",
        "/data/uploads/a.jpg",
    ]


def test_thumbnail_args_use_given_video_stream_index():
    args = build_thumbnail_args(Path("/in.bin"), Path("/out.jpg"), video_stream_index=2)

    assert args[args.index("-map") + 1] == "0:2"


def test_thumbnail_args_do_not_seek_so_first_frame_is_used():
    args = build_thumbnail_args(Path("/in.bin"), Path("/out.jpg"), video_stream_index=0)

    assert "-ss" not in args
