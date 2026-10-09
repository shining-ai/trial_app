import math
from dataclasses import dataclass

# 全角20文字(1文字 = 1em)で短い辺の90%になる大きさ
_FONT_SIZE_RATIO = 0.045
_LINE_HEIGHT_RATIO = 1.5
# 左右に5%ずつ余白を残す
_MAX_LINE_WIDTH_RATIO = 0.9


@dataclass(frozen=True)
class TextSceneLayout:
    """テキストの場面の文字の大きさと、各行の中心の座標。"""

    font_size: int
    line_centers: tuple[tuple[float, float], ...]


def layout_text_scene(width: int, height: int, line_widths: list[float]) -> TextSceneLayout:
    """出力の幅・高さと各行の幅(描画側が測ったピクセル数)から、文字の大きさと行の位置を決める。

    描けないとき(文字の大きさが1ピクセル未満、行が左右の余白にかかる)は ValueError を送出する。
    メッセージには行の中身を入れない(ログに残るため)。
    """
    font_size = math.floor(min(width, height) * _FONT_SIZE_RATIO)
    if font_size < 1:
        raise ValueError(f"出力 {width}x{height} では文字の大きさが1ピクセル未満になります")
    max_line_width = width * _MAX_LINE_WIDTH_RATIO
    for number, line_width in enumerate(line_widths, start=1):
        if line_width > max_line_width:
            raise ValueError(
                f"{number}行目の幅 {line_width:g}px が出力 {width}x{height} の描ける幅 {max_line_width:g}px を超えています"
            )
    line_height = font_size * _LINE_HEIGHT_RATIO
    middle = (len(line_widths) - 1) / 2
    centers = tuple((width / 2, height / 2 + (i - middle) * line_height) for i in range(len(line_widths)))
    return TextSceneLayout(font_size=font_size, line_centers=centers)
