from app.features.merge.merge_source import MergeSource
from app.features.merge.plan_output_format import plan_output_format


def _src(width, height, fps=(30, 1)):
    return MergeSource(video_id="a" * 32, file_name="a.mp4", size_bytes=1, duration_seconds=1.0, width=width,
                       height=height, fps_num=fps[0], fps_den=fps[1], has_audio=True, video_stream_index=0, audio_stream_index=1)


def test_width_and_height_are_each_maximum():
    out = plan_output_format([_src(1920, 1080), _src(1080, 1920)], max_fps=60)

    assert (out.width, out.height) == (1920, 1920)


def test_odd_size_is_rounded_up_to_even():
    out = plan_output_format([_src(1919, 1079)], max_fps=60)

    assert (out.width, out.height) == (1920, 1080)


def test_fps_is_maximum_compared_as_fraction():
    assert _fps([_src(640, 360, (30, 1)), _src(640, 360, (60, 1))]) == (60, 1)
    assert _fps([_src(640, 360, (30000, 1001)), _src(640, 360, (30, 1))]) == (30, 1)
    assert _fps([_src(640, 360, (30000, 1001)), _src(640, 360, (2997, 100))]) == (30000, 1001)


def test_fps_above_limit_is_capped():
    assert _fps([_src(640, 360, (30, 1)), _src(640, 360, (120, 1))]) == (60, 1)


def test_single_video_keeps_its_size_and_fps():
    out = plan_output_format([_src(640, 360, (25, 1))], max_fps=60)

    assert (out.width, out.height, out.fps_num, out.fps_den) == (640, 360, 25, 1)


def _fps(sources):
    out = plan_output_format(sources, max_fps=60)
    return out.fps_num, out.fps_den
