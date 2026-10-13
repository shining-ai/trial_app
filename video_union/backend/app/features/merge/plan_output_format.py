from dataclasses import dataclass
from fractions import Fraction

from app.features.merge.merge_source import MergeSource


@dataclass(frozen=True)
class OutputFormat:
    width: int
    height: int
    fps_num: int
    fps_den: int


def plan_output_format(sources: list[MergeSource], max_fps: int) -> OutputFormat:
    """出力の幅・高さ(それぞれの最大値を偶数に切り上げ)と fps(最大値、上限あり)を決める。"""
    width = max(s.width for s in sources)
    height = max(s.height for s in sources)
    fps = min(max(Fraction(s.fps_num, s.fps_den) for s in sources), Fraction(max_fps))
    return OutputFormat(_even(width), _even(height), fps.numerator, fps.denominator)


def _even(value: int) -> int:
    return value + value % 2
