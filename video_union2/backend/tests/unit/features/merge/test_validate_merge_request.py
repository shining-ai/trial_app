from app.features.merge.merge_segment import TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.validate_merge_request import validate_merge_request, validate_video_ids
from app.lib.config import Settings

SETTINGS = Settings()
PLENTY = 10**15


def _src(i, duration=1.0, size=100, width=640, height=360):
    return MergeSource(video_id=f"{i:032x}", file_name=f"{i}.mp4", size_bytes=size, duration_seconds=duration,
                       width=width, height=height, fps_num=30, fps_den=1, has_audio=True, video_stream_index=0, audio_stream_index=1)


def _check(sources, free=PLENTY, settings=SETTINGS):
    failure = validate_video_ids([s.video_id for s in sources], settings) or validate_merge_request(
        sources, free_bytes=free, settings=settings)
    return None if failure is None else (failure.status, failure.code, failure.message)


def test_ids_are_checked_for_count_and_duplicates_before_reading_anything():
    ids = ["a" * 32] * 200_000

    failure = validate_video_ids(ids, SETTINGS)

    assert (failure.status, failure.code) == (422, "too_many_videos")
    assert validate_video_ids(["a" * 32, "a" * 32], SETTINGS).code == "duplicate_video"
    assert validate_video_ids(["a" * 32, "b" * 32], SETTINGS) is None


def test_two_videos_are_allowed_and_fewer_are_rejected():
    assert _check([_src(1), _src(2)]) is None
    assert _check([_src(1)]) == (422, "too_few_videos", "結合するには2本以上の動画が必要です")
    assert _check([]) == (422, "too_few_videos", "結合するには2本以上の動画が必要です")


def test_100_videos_are_allowed_and_101_are_rejected():
    assert _check([_src(i, duration=1.0) for i in range(100)]) is None
    assert _check([_src(i, duration=1.0) for i in range(101)]) == (
        422, "too_many_videos", "一度に結合できるのは100本までです")


def test_duplicate_video_is_rejected():
    assert _check([_src(1), _src(1)]) == (422, "duplicate_video", "同じ動画が2回指定されています")


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


def test_text_scene_needs_an_output_whose_short_side_is_at_least_23_pixels():
    message = "動画の解像度が小さすぎて、テキストの場面を表示できません(出力の短い辺が23ピクセル以上必要です)"

    assert _check_segments([_src(1, width=22, height=22), _text(30)]) == (422, "output_too_small_for_text", message)
    assert _check_segments([_src(1, width=24, height=24), _text(30)]) is None
    assert _check_segments([_src(1, width=22, height=22), _src(2, width=22, height=22)]) is None
