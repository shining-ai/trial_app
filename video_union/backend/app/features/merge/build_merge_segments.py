from app.features.merge.merge_segment import MergeSegment, TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.schemas import TextItem, VideoItem


def build_merge_segments(
    items: list[VideoItem | TextItem], text_scenes: dict[int, TextScene], sources: list[MergeSource]
) -> list[MergeSegment]:
    """items の並びに沿って、動画の MergeSource(動画の順)とテキストの場面から入力の列を作る。"""
    video_count = sum(isinstance(item, VideoItem) for item in items)
    if video_count != len(sources):
        raise ValueError(f"動画の数 {video_count} と読み出した動画の数 {len(sources)} が一致しません")
    remaining = iter(sources)
    return [next(remaining) if isinstance(item, VideoItem) else text_scenes[index] for index, item in enumerate(items)]
