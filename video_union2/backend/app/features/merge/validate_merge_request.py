import math
from dataclasses import dataclass

from app.features.merge.format_excess import format_excess
from app.features.merge.layout_text_scene import text_scene_font_size
from app.features.merge.merge_segment import MergeSegment, TextScene
from app.features.merge.merge_source import MergeSource
from app.features.merge.plan_output_format import OutputFormat, plan_output_format
from app.features.merge.text_scene_duration import text_scene_duration
from app.lib.config import Settings

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
    output = plan_output_format(sources, settings.max_fps) if sources else None
    # 浮動小数の足し算の誤差で画面と判定が食い違わないよう、各動画をミリ秒の整数にしてから足す
    # (画面の sumMergeItemsMilliseconds と同じ計算: 0.5 ミリ秒は切り上げ。テキストの場面は0.1秒単位の整数から)
    videos_ms = sum(math.floor(s.duration_seconds * 1000 + 0.5) for s in sources)
    limit_ms = settings.max_total_seconds * 1000
    specified_ms = videos_ms + sum(t.duration_tenths * 100 for t in texts)
    if specified_ms > limit_ms:
        return _too_long(specified_ms - limit_ms, settings)
    # テキストの場面は出力のフレーム数に丸めて作るため、fps が低いと指定より長くなる。
    # 出力の±1フレームのずれは許す(video-merge の Q13)ので、丸めたあとの合計が上限 + 1フレームを超えたときだけ断る
    if texts and output is not None:
        rounded_ms = videos_ms + sum(_rounded_milliseconds(t, output) for t in texts)
        frame_ms = 1000 * output.fps_den / output.fps_num
        if rounded_ms > limit_ms + frame_ms:
            return _too_long(rounded_ms - limit_ms, settings)

    if texts and output is not None:
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


def _too_long(excess_ms: float, settings: Settings) -> MergeRequestFailure:
    minutes = settings.max_total_seconds // 60
    return MergeRequestFailure(
        422, "too_long", f"結合後の長さが{minutes}分を{format_excess(excess_ms / 1000)}超えています")


def _rounded_milliseconds(text: TextScene, output: OutputFormat) -> int:
    """テキストの場面を出力の fps のフレーム数に丸めたときの長さ(ミリ秒)。"""
    _, seconds = text_scene_duration(text.duration_tenths, output)
    return math.floor(seconds * 1000 + 0.5)

