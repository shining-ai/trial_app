from app.features.merge.merge_source import MergeSource
from app.features.merge.validate_merge_request import validate_merge_request
from app.lib.config import Settings

SETTINGS = Settings()
PLENTY = 10**15


def _src(i, duration=1.0, size=100):
    return MergeSource(video_id=f"{i:032x}", file_name=f"{i}.mp4", size_bytes=size, duration_seconds=duration,
                       width=640, height=360, fps_num=30, fps_den=1, has_audio=True)


def _check(sources, free=PLENTY, settings=SETTINGS):
    failure = validate_merge_request(sources, free_bytes=free, settings=settings)
    return None if failure is None else (failure.status, failure.code, failure.message)


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


def test_free_space_must_be_at_least_twice_the_input_size():
    sources = [_src(1, size=1000), _src(2, size=500)]

    assert _check(sources, free=3000) is None
    assert _check(sources, free=2999) == (507, "insufficient_storage", "保存先の空き容量が足りません")


def test_limits_come_from_settings():
    small = Settings(max_total_seconds=2)

    assert _check([_src(1, 1.0), _src(2, 1.0)], settings=small) is None
    assert _check([_src(1, 1.0), _src(2, 1.5)], settings=small)[1] == "too_long"
