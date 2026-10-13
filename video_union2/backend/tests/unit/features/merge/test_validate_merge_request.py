from app.features.merge.merge_segment import TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.validate_merge_request import validate_merge_request
from app.lib.config import Settings

SETTINGS = Settings()
PLENTY = 10**15


def _src(i, duration=1.0, size=100, width=640, height=360):
    return MergeSource(video_id=f"{i:032x}", file_name=f"{i}.mp4", size_bytes=size, duration_seconds=duration,
                       width=width, height=height, fps_num=30, fps_den=1, has_audio=True, video_stream_index=0, audio_stream_index=1)


def _check(sources, free=PLENTY, settings=SETTINGS):
    failure = validate_merge_request(sources, free_bytes=free, settings=settings)
    return None if failure is None else (failure.status, failure.code, failure.message)


def test_total_of_exactly_1800_seconds_is_allowed_and_over_is_rejected_with_excess():
    assert _check([_src(1, 900.0), _src(2, 900.0)]) is None
    assert _check([_src(1, 900.0), _src(2, 900.001)]) == (
        422, "too_long", "結合後の長さが30分を1秒超えています")
    assert _check([_src(1, 900.0), _src(2, 1035.0)]) == (
        422, "too_long", "結合後の長さが30分を2分15秒超えています")


def test_floating_point_error_does_not_break_the_boundary():
    assert _check([_src(1, 600.1), _src(2, 600.2), _src(3, 599.7)]) is None
    assert _check([_src(1, 600.1), _src(2, 600.2), _src(3, 599.701)])[1] == "too_long"


def test_totals_are_summed_in_whole_milliseconds_like_the_frontend():
    # 合計がちょうど 1800.0005 秒付近になる値。画面(frontend)の checkMergeable と同じ判定になる
    first = [_src(i, d) for i, d in enumerate([421.507158, 429.191406, 949.301936])]
    second = [_src(i, d) for i, d in enumerate([482.637353, 507.069465, 407.608742, 225.43726, 177.24768])]

    assert _check(first) is None
    assert _check(second) is None
    assert _check([_src(1, 900.0004), _src(2, 900.0006)])[2] == "結合後の長さが30分を1秒超えています"


def test_free_space_must_be_at_least_twice_the_input_size():
    sources = [_src(1, size=1000), _src(2, size=500)]

    assert _check(sources, free=3000) is None
    assert _check(sources, free=2999) == (507, "insufficient_storage", "保存先の空き容量が足りません")


def test_limits_come_from_settings():
    small = Settings(max_total_seconds=2)

    assert _check([_src(1, 1.0), _src(2, 1.0)], settings=small) is None
    assert _check([_src(1, 1.0), _src(2, 1.5)], settings=small)[1] == "too_long"


def _text(tenths):
    return TextScene(lines=("京都",), duration_tenths=tenths)


def _check_segments(segments, free=PLENTY, settings=SETTINGS):
    failure = validate_merge_request(segments, free_bytes=free, settings=settings)
    return None if failure is None else (failure.status, failure.code, failure.message)


def test_text_scene_durations_are_added_to_the_total():
    assert _check_segments([_src(1, 1790.0), _text(100)]) is None
    assert _check_segments([_src(1, 1790.0), _text(101)]) == (
        422, "too_long", "結合後の長さが30分を1秒超えています")


def test_text_scene_durations_are_summed_in_whole_milliseconds():
    assert _check_segments([_src(1, 600.1), _src(2, 600.2), _text(5997)]) is None
    assert _check_segments([_src(1, 600.1), _src(2, 600.2), _text(5998)])[1] == "too_long"


def _video_at(fps_num, fps_den, duration):
    return MergeSource(video_id="a" * 32, file_name="a.mp4", size_bytes=1, duration_seconds=duration, width=640,
                       height=360, fps_num=fps_num, fps_den=fps_den, has_audio=True, video_stream_index=0,
                       audio_stream_index=1)


def test_ntsc_frame_rounding_within_one_frame_is_judged_like_the_screen():
    ntsc = _video_at(30000, 1001, 1790.0)

    # 10.0 秒は 300 フレーム = 10.01 秒になるが、1フレームの範囲なので画面と同じく許可する
    assert _check_segments([ntsc, _text(100)]) is None
    assert _check_segments([_video_at(30000, 1001, 1799.0), _text(10)]) is None
    assert _check_segments([ntsc, _text(101)]) == (422, "too_long", "結合後の長さが30分を1秒超えています")


def test_ntsc_rounding_of_several_text_scenes_is_allowed_up_to_one_frame_in_total():
    # 10.0 秒 × 3 は丸めて +30ms(1フレーム 33.37ms 以内)なので許可
    assert _check_segments([_video_at(30000, 1001, 1770.0)] + [_text(100)] * 3) is None
    # 16.5 秒 × 2 は丸めて +34ms で1フレームを超えるため、指定の合計がちょうど30分でも断る(既知の制限 I-6)
    assert _check_segments([_video_at(30000, 1001, 1767.0)] + [_text(165)] * 2) == (
        422, "too_long", "結合後の長さが30分を1秒超えています")


def test_low_fps_rounding_that_lengthens_the_output_beyond_one_frame_is_rejected():
    one_fps = _video_at(1, 1, 1.0)
    limit = Settings(max_total_seconds=7)

    # 指定どおりなら 1 + 1.5 × 4 = 7.0 秒だが、1fps では 1.5 秒が 2 フレーム(2.0 秒)になり 9.0 秒。上限 + 1フレーム(8秒)を超える
    assert _check_segments([one_fps] + [_text(15)] * 4, settings=limit) == (
        422, "too_long", "結合後の長さが0分を2秒超えています")
    # 1 + 1.5 + 1.5 + 2.0 + 1.0 = 7.0 秒が、丸めると 1 + 2 + 2 + 2 + 1 = 8 秒。上限 + 1フレームちょうどは許可
    assert _check_segments([one_fps, _text(15), _text(15), _text(20), _text(10)], settings=limit) is None


def test_rounding_that_shortens_a_text_scene_does_not_loosen_the_limit():
    one_fps = _video_at(1, 1, 1.0)
    limit = Settings(max_total_seconds=3)

    # 1.4 秒は 1fps で 1 フレーム(1.0 秒)になるが、指定の 1 + 1.4 + 1.4 = 3.8 秒で判定する
    assert _check_segments([one_fps, _text(14), _text(14)], settings=limit)[1] == "too_long"


def test_text_scene_needs_an_output_whose_short_side_is_at_least_23_pixels():
    message = "動画の解像度が小さすぎて、テキストの場面を表示できません(出力の短い辺が23ピクセル以上必要です)"

    assert _check_segments([_src(1, width=22, height=22), _text(30)]) == (422, "output_too_small_for_text", message)
    assert _check_segments([_src(1, width=24, height=24), _text(30)]) is None
    assert _check_segments([_src(1, width=22, height=22), _src(2, width=22, height=22)]) is None
