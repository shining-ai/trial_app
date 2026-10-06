from dataclasses import dataclass

from app.features.merge.format_excess import format_excess
from app.features.merge.merge_source import MergeSource
from app.lib.config import Settings

_MIN_VIDEOS = 2
_STORAGE_FACTOR = 2


@dataclass(frozen=True)
class MergeRequestFailure:
    status: int
    code: str
    message: str


def validate_merge_request(
    sources: list[MergeSource], *, free_bytes: int, settings: Settings
) -> MergeRequestFailure | None:
    """本数・重複・長さの合計・空き容量を確かめ、結合できないときは理由を返す。"""
    if len(sources) < _MIN_VIDEOS:
        return MergeRequestFailure(422, "too_few_videos", "結合するには2本以上の動画が必要です")
    if len(sources) > settings.max_videos:
        return MergeRequestFailure(422, "too_many_videos", f"一度に結合できるのは{settings.max_videos}本までです")
    if len({s.video_id for s in sources}) != len(sources):
        return MergeRequestFailure(422, "duplicate_video", "同じ動画が2回指定されています")

    # 浮動小数の誤差で境界を誤らないよう、ミリ秒に丸めて比べる
    total = round(sum(s.duration_seconds for s in sources), 3)
    limit = settings.max_total_seconds
    if total > limit:
        minutes = limit // 60
        return MergeRequestFailure(
            422, "too_long", f"結合後の長さが{minutes}分を{format_excess(total - limit)}超えています"
        )

    if free_bytes < sum(s.size_bytes for s in sources) * _STORAGE_FACTOR:
        return MergeRequestFailure(507, "insufficient_storage", "保存先の空き容量が足りません")
    return None
