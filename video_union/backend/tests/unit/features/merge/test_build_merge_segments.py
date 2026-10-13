import pytest

from app.features.merge.build_merge_segments import build_merge_segments
from app.features.merge.merge_segment import TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.schemas import TextItem, VideoItem


def _src(i):
    return MergeSource(video_id=f"{i:032x}", file_name=f"{i}.mp4", size_bytes=1, duration_seconds=1.0, width=640,
                       height=360, fps_num=30, fps_den=1, has_audio=True, video_stream_index=0, audio_stream_index=1)


def _v(i):
    return VideoItem(type="video", video_id=f"{i:032x}")


def _t(text):
    return TextItem(type="text", text=text, duration_tenths=30)


def test_segments_follow_the_list_order_of_videos_and_text_scenes():
    first, second = TextScene(("京都",), 30), TextScene(("嵐山",), 55)

    segments = build_merge_segments([_t("京都"), _v(1), _t("嵐山"), _v(2)], {0: first, 2: second}, [_src(1), _src(2)])

    assert segments == [first, _src(1), second, _src(2)]


def test_videos_only_give_the_sources_in_order():
    assert build_merge_segments([_v(2), _v(1)], {}, [_src(2), _src(1)]) == [_src(2), _src(1)]


def test_mismatched_sources_are_a_programming_error():
    with pytest.raises(ValueError):
        build_merge_segments([_v(1), _v(2)], {}, [_src(1)])
