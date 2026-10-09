from app.features.merge.schemas import TextItem, VideoItem
from app.features.merge.validate_merge_items import validate_merge_items
from app.lib.config import Settings

SETTINGS = Settings()


def _v(i):
    return VideoItem(type="video", video_id=f"{i:032x}")


def _t(tenths=30, text="京都"):
    return TextItem(type="text", text=text, duration_tenths=tenths)


def _check(items, settings=SETTINGS):
    failure = validate_merge_items(items, settings)
    return None if failure is None else (failure.status, failure.code, failure.message)


def test_two_videos_or_one_video_with_text_scenes_are_allowed():
    assert _check([_v(1), _v(2)]) is None
    assert _check([_v(1), _t()]) is None
    assert _check([_t(), _v(1), _t()]) is None


def test_at_least_one_video_is_required():
    assert _check([]) == (422, "no_video", "結合するには動画が1本以上必要です")
    assert _check([_t(), _t()]) == (422, "no_video", "結合するには動画が1本以上必要です")


def test_a_single_video_alone_is_too_few():
    assert _check([_v(1)]) == (422, "too_few_items", "結合するには動画とテキストの場面を合わせて2つ以上必要です")


def test_100_videos_with_text_scenes_are_allowed_and_101_videos_are_rejected():
    assert _check([_v(i) for i in range(100)] + [_t() for _ in range(5)]) is None
    assert _check([_v(i) for i in range(101)]) == (422, "too_many_videos", "一度に結合できるのは100本までです")


def test_text_scenes_do_not_count_toward_the_video_limit():
    small = Settings(max_videos=2)

    assert _check([_v(1), _t(), _v(2), _t(), _t()], settings=small) is None
    assert _check([_v(1), _v(2), _v(3)], settings=small)[1] == "too_many_videos"


def test_same_video_twice_is_rejected_but_same_text_twice_is_allowed():
    assert _check([_v(1), _v(1)]) == (422, "duplicate_video", "同じ動画が2回指定されています")
    assert _check([_v(1), _t(text="京都"), _t(text="京都")]) is None


def test_huge_list_of_the_same_id_is_rejected_by_count_without_reading_anything():
    assert _check([_v(1)] * 200_000)[1] == "too_many_videos"


def test_duration_from_1_to_60_seconds_is_allowed_and_outside_is_rejected_with_list_position():
    message = "2番目のテキストの場面: 表示時間は1秒から60秒までで、小数第1位まで指定してください"

    assert _check([_v(1), _t(10)]) is None
    assert _check([_v(1), _t(600)]) is None
    assert _check([_v(1), _t(9)]) == (422, "invalid_text_scene", message)
    assert _check([_v(1), _t(601)]) == (422, "invalid_text_scene", message)
    assert _check([_v(1), _t(30), _t(0)])[2].startswith("3番目のテキストの場面: ")
