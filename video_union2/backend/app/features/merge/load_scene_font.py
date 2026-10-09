import time
from dataclasses import dataclass
from pathlib import Path

from fontTools.ttLib import TTFont

from app.lib.logger import log_error, log_info

_NAME = "merge.load_scene_font"
_SETTING = "SCENE_FONT_PATH"
_SLOW_MS = 1000


@dataclass(frozen=True)
class SceneFont:
    """テキストの場面を描くフォント。code_points はフォントに字形がある文字のコードポイント。"""

    path: Path
    code_points: frozenset[int]


def load_scene_font(path: Path) -> SceneFont:
    """フォントを読み、フォントにある文字の集合を作る。

    読めなければ記録してから再送出する。記録にはパスの値を入れない(環境変数の値のため)。
    """
    started = time.monotonic()
    try:
        if not path.is_file():
            raise FileNotFoundError(f"{_SETTING} のフォントファイルが見つかりません")
        with TTFont(path, lazy=True) as font:
            cmap = font.getBestCmap()
        if not cmap:
            raise ValueError(f"{_SETTING} のフォントに文字の表がありません")
    except Exception as e:
        log_error(_NAME, "フォントを読み込めませんでした", err=e, setting=_SETTING)
        raise
    elapsed_ms = round((time.monotonic() - started) * 1000)
    if elapsed_ms > _SLOW_MS:
        log_info(_NAME, "フォントを読み込みました", ms=elapsed_ms)
    return SceneFont(path=path, code_points=frozenset(cmap))
