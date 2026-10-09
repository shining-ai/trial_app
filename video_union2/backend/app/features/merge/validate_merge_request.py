import math
from dataclasses import dataclass

from app.features.merge.format_excess import format_excess
from app.features.merge.layout_text_scene import text_scene_font_size
from app.features.merge.merge_segment import MergeSegment, TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.plan_output_format import plan_output_format
from app.lib.config import Settings

_MIN_VIDEOS = 2
_STORAGE_FACTOR = 2


@dataclass(frozen=True)
class MergeRequestFailure:
    status: int
    code: str
    message: str


def validate_merge_request(
    segments: list[MergeSegment], *, free_bytes: int, settings: Settings
) -> MergeRequestFailure | None:
    """メタ情報を読んだあとに、長さの合計・テキストの場面を描ける出力サイズか・空き容量を確かめ、だめなら理由を返す。

    本数・重複・表示時間は validate_merge_items で先に確かめる。
    """
    sources = [s for s in segments if isinstance(s, MergeSource)]
    texts = [s for s in segments if isinstance(s, TextScene)]
    # 浮動小数の足し算の誤差で画面と判定が食い違わないよう、各動画をミリ秒の整数にしてから足す
    # (画面の sumMergeItemsMilliseconds と同じ計算: 0.5 ミリ秒は切り上げ。テキストの場面は0.1秒単位の整数から)
    total_ms = sum(math.floor(s.duration_seconds * 1000 + 0.5) for s in sources)
    total_ms += sum(t.duration_tenths * 100 for t in texts)
    limit = settings.max_total_seconds
    if total_ms > limit * 1000:
        minutes = limit // 60
        excess = (total_ms - limit * 1000) / 1000
        return MergeRequestFailure(422, "too_long", f"結合後の長さが{minutes}分を{format_excess(excess)}超えています")

    if texts and sources:
        output = plan_output_format(sources, settings.max_fps)
        try:
            text_scene_font_size(output.width, output.height)
        except ValueError:
            return MergeRequestFailure(
                422, "output_too_small_for_text",
                "動画の解像度が小さすぎて、テキストの場面を表示できません(出力の短い辺が23ピクセル以上必要です)",
            )

    # テキストの場面は静止画で、1秒あたりの大きさが動画より十分小さいため見積もりに足さない
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
