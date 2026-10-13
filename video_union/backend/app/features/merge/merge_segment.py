from dataclasses import dataclass

from app.features.merge.merge_source import MergeSource


@dataclass(frozen=True)
class TextScene:
    """結合の入力になるテキストの場面。lines は正規化済みの行。"""

    lines: tuple[str, ...]
    duration_tenths: int


# 結合の入力の1つ(リストの順に並べて処理する)
MergeSegment = MergeSource | TextScene
