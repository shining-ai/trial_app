from pathlib import Path

from app.features.merge.build_normalize_args import build_normalize_args
from app.features.merge.build_text_scene_args import build_text_scene_args
from app.features.merge.merge_source import MergeSource
from app.features.merge.plan_output_format import OutputFormat

IMAGE = Path("/data/merges/j/parts/0003.png")
OUTPUT = Path("/data/merges/j/parts/0003.mp4")
FORMAT = OutputFormat(width=1920, height=1080, fps_num=30000, fps_den=1001)
ENCODE = [
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-video_track_timescale", "90000",
]


def _args(frames=165, seconds=5.5055):
    return build_text_scene_args(FORMAT, image_path=IMAGE, output_path=OUTPUT, frames=frames, seconds=seconds,
                                 preset="veryfast", crf=20)


def test_args_loop_the_png_with_silent_stereo_for_the_given_frames():
    assert _args() == [
        "ffmpeg", "-y", "-nostdin", "-v", "error", "-xerror",
        "-protocol_whitelist", "file", "-format_whitelist", "image2", "-f", "image2", "-pattern_type", "none",
        "-loop", "1", "-framerate", "30000/1001", "-i", str(IMAGE),
        "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
        "-filter_complex", "[0:v]setsar=1,fps=30000/1001,format=yuv420p[v]",
        "-map", "[v]", "-map", "1:a",
        "-frames:v", "165", "-t", "5.505500",
        *ENCODE,
        "-progress", "pipe:1", "-nostats",
        str(OUTPUT),
    ]


def test_frame_count_and_duration_follow_the_arguments():
    args = _args(frames=24, seconds=1.0)

    assert args[args.index("-frames:v") + 1] == "24"
    assert args[args.index("-t") + 1] == "1.000000"


def test_encoder_arguments_are_the_same_as_for_videos():
    source = MergeSource(video_id="a" * 32, file_name="a.mp4", size_bytes=1, duration_seconds=1.0, width=640,
                         height=360, fps_num=30, fps_den=1, has_audio=True, video_stream_index=0, audio_stream_index=1)
    video_args = build_normalize_args(source, FORMAT, input_path=Path("/data/uploads/a.bin"), output_path=OUTPUT,
                                      preset="veryfast", crf=20)

    start = video_args.index("-c:v")
    assert video_args[start:start + len(ENCODE)] == ENCODE
