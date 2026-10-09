from app.features.merge.schemas import TextItem, VideoItem
from app.features.merge.validate_merge_request import MergeRequestFailure
from app.lib.config import Settings

_MIN_ITEMS = 2
_MIN_DURATION_TENTHS = 10
_MAX_DURATION_TENTHS = 600


def validate_merge_items(items: list[VideoItem | TextItem], settings: Settings) -> MergeRequestFailure | None:
    """メタ情報を読む前に、動画の本数・全体の数・重複・表示時間を確かめ、だめなら理由を返す。

    テキストの場面は動画の本数に数えない。表示時間の失敗の番号は、リスト全体での位置で数える。
    """
    video_ids = [item.video_id for item in items if isinstance(item, VideoItem)]
    if not video_ids:
        return MergeRequestFailure(422, "no_video", "結合するには動画が1本以上必要です")
    if len(items) < _MIN_ITEMS:
        return MergeRequestFailure(
            422, "too_few_items", "結合するには動画とテキストの場面を合わせて2つ以上必要です")
    if len(video_ids) > settings.max_videos:
        return MergeRequestFailure(422, "too_many_videos", f"一度に結合できるのは{settings.max_videos}本までです")
    if len(set(video_ids)) != len(video_ids):
        return MergeRequestFailure(422, "duplicate_video", "同じ動画が2回指定されています")
    for position, item in enumerate(items, start=1):
        if isinstance(item, TextItem) and not _MIN_DURATION_TENTHS <= item.duration_tenths <= _MAX_DURATION_TENTHS:
            return MergeRequestFailure(
                422, "invalid_text_scene",
                f"{position}番目のテキストの場面: 表示時間は1秒から60秒までで、小数第1位まで指定してください",
            )
    return None
