import math
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
    """長さの合計と空き容量を確かめ、結合できないときは理由を返す(本数と重複は validate_video_ids で確かめる)。"""
    # 浮動小数の足し算の誤差で画面と判定が食い違わないよう、各動画をミリ秒の整数にしてから足す
    # (画面の useMergeQueue と同じ計算: 0.5 ミリ秒は切り上げ)
    total_ms = sum(math.floor(s.duration_seconds * 1000 + 0.5) for s in sources)
    limit = settings.max_total_seconds
    if total_ms > limit * 1000:
        minutes = limit // 60
        excess = (total_ms - limit * 1000) / 1000
        return MergeRequestFailure(422, "too_long", f"結合後の長さが{minutes}分を{format_excess(excess)}超えています")

    if free_bytes < sum(s.size_bytes for s in sources) * _STORAGE_FACTOR:
        return MergeRequestFailure(507, "insufficient_storage", "保存先の空き容量が足りません")
    return None


def validate_video_ids(video_ids: list[str], settings: Settings) -> MergeRequestFailure | None:
    """メタ情報を読む前に、ID の本数と重複を確かめる。"""
    if len(video_ids) < _MIN_VIDEOS:
        return MergeRequestFailure(422, "too_few_videos", "結合するには2本以上の動画が必要です")
    if len(video_ids) > settings.max_videos:
        return MergeRequestFailure(422, "too_many_videos", f"一度に結合できるのは{settings.max_videos}本までです")
    if len(set(video_ids)) != len(video_ids):
        return MergeRequestFailure(422, "duplicate_video", "同じ動画が2回指定されています")
    return None
