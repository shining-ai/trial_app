from pathlib import Path

from app.features.merge.build_normalize_args import build_normalize_args
from app.features.merge.merge_source import MergeSource
from app.features.merge.plan_output_format import OutputFormat
from app.lib.media_input_policy import ALLOWED_FORMATS

INPUT = Path("/data/uploads/a.bin")
OUTPUT = Path("/data/merges/j/parts/0001.mp4")
FORMAT = OutputFormat(width=1920, height=1080, fps_num=30000, fps_den=1001)


def _src(has_audio=True, duration=2.5, video_index=0, audio_index=1):
    return MergeSource(video_id="a" * 32, file_name="a.mp4", size_bytes=1, duration_seconds=duration, width=640,
                       height=360, fps_num=30, fps_den=1, has_audio=has_audio, video_stream_index=video_index,
                       audio_stream_index=audio_index if has_audio else None)


def _args(**kwargs):
    return build_normalize_args(_src(**kwargs), FORMAT, input_path=INPUT, output_path=OUTPUT, preset="veryfast", crf=20)


def _filter(args):
    return args[args.index("-filter_complex") + 1]


def test_video_is_padded_to_output_size_with_black_and_never_scaled():
    graph = _filter(_args())

    assert "pad=1920:1080:(1920-iw)/2:(1080-ih)/2:color=black" in graph
    assert "scale" not in graph


def test_video_filter_sets_square_pixels_fixed_fps_and_yuv420p_from_first_video_stream():
    video_chain = _filter(_args()).split(";")[0]

    assert video_chain.startswith("[0:0]")
    assert "setsar=1" in video_chain
    assert "fps=30000/1001" in video_chain
    assert "format=yuv420p" in video_chain


def test_input_is_restricted_and_comes_right_after_dash_i():
    args = _args()
    first_input = args.index("-i")

    assert args[first_input + 1] == str(INPUT)
    assert args[first_input - 4:first_input] == ["-protocol_whitelist", "file", "-format_whitelist", ",".join(ALLOWED_FORMATS)]


def test_duration_from_metadata_limits_the_output():
    args = _args(duration=2.5)

    assert args[args.index("-t") + 1] == "2.500000"


def test_video_with_audio_uses_first_audio_stream_without_anullsrc():
    args = _args(has_audio=True)
    audio_chain = _filter(args).split(";")[1]

    assert audio_chain.startswith("[0:1]")
    assert not any("anullsrc" in a for a in args)


def test_video_without_audio_adds_silent_input_and_uses_it():
    args = _args(has_audio=False)
    audio_chain = _filter(args).split(";")[1]

    assert args[args.index("-f", args.index("-i") + 1):][:4] == ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    assert audio_chain.startswith("[1:a:0]")


def test_audio_is_resampled_to_48k_stereo_and_padded_then_cut_to_video_length():
    args = _args()
    audio_chain = _filter(args).split(";")[1]

    assert "aresample=48000" in audio_chain
    assert "aformat=channel_layouts=stereo" in audio_chain
    assert "apad" in audio_chain
    assert "-shortest" in args


def test_encoding_options_and_progress_output():
    args = _args()

    for expected in (["-c:v", "libx264"], ["-preset", "veryfast"], ["-crf", "20"], ["-pix_fmt", "yuv420p"],
                     ["-c:a", "aac"], ["-progress", "pipe:1"]):
        i = args.index(expected[0])
        assert args[i:i + 2] == expected
    assert args[-1] == str(OUTPUT)
    assert all(isinstance(a, str) for a in args)


def test_streams_are_chosen_by_absolute_index_so_cover_art_is_skipped():
    args = _args(video_index=2, audio_index=3)
    video_chain, audio_chain = _filter(args).split(";")

    assert video_chain.startswith("[0:2]")
    assert audio_chain.startswith("[0:3]")


def test_decoding_errors_stop_the_conversion():
    assert "-xerror" in _args()


def test_tiny_duration_is_written_without_exponent():
    args = _args(duration=0.00001)

    assert args[args.index("-t") + 1] == "0.000010"
