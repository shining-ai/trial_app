import math
from fractions import Fraction

from app.features.merge.plan_output_format import OutputFormat


def text_scene_duration(duration_tenths: int, output: OutputFormat) -> tuple[int, float]:
    """表示時間(0.1秒単位)を、出力の fps のフレーム数と、そのフレーム数の秒数にする。

    フレーム数は四捨五入(0.5は切り上げ)し、最小1。浮動小数の誤差が出ないよう分数で計算する。
    """
    fps = Fraction(output.fps_num, output.fps_den)
    frames = max(1, math.floor(Fraction(duration_tenths, 10) * fps + Fraction(1, 2)))
    return frames, float(frames / fps)
