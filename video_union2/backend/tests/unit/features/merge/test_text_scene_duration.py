from app.features.merge.plan_output_format import OutputFormat
from app.features.merge.text_scene_duration import text_scene_duration


def _fmt(fps_num, fps_den=1):
    return OutputFormat(width=640, height=360, fps_num=fps_num, fps_den=fps_den)


def test_duration_is_rounded_to_whole_frames_of_the_output_fps():
    assert text_scene_duration(55, _fmt(30)) == (165, 5.5)
    assert text_scene_duration(10, _fmt(24)) == (24, 1.0)


def test_ntsc_fps_rounds_half_frames_up_and_returns_the_rounded_seconds():
    # 5.5秒 × 30000/1001 = 164.835 フレーム → 165 フレーム = 5.5055 秒
    frames, seconds = text_scene_duration(55, _fmt(30000, 1001))

    assert frames == 165
    assert round(seconds, 6) == 5.5055


def test_exactly_half_a_frame_rounds_up():
    # 0.5秒 × 5fps = 2.5 フレーム → 3 フレーム
    assert text_scene_duration(5, _fmt(5))[0] == 3


def test_at_least_one_frame_is_made():
    assert text_scene_duration(1, _fmt(1)) == (1, 1.0)
