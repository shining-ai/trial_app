from app.features.merge.merge_segment import TextScene
from app.features.merge.normalize_scene_text import SceneTextFailure, normalize_scene_text
from app.features.merge.schemas import TextItem, VideoItem
from app.features.merge.validate_merge_request import MergeRequestFailure


def normalize_text_items(
    items: list[VideoItem | TextItem], font_code_points: frozenset[int]
) -> dict[int, TextScene] | MergeRequestFailure:
    """テキストの場面を前から順に正規化し、リストでの位置(0始まり)と TextScene の対応を返す。

    最初に失敗したテキストの場面で止め、リスト全体での番号を頭に付けた理由を返す。
    """
    scenes = {}
    for index, item in enumerate(items):
        if not isinstance(item, TextItem):
            continue
        result = normalize_scene_text(item.text, font_code_points)
        if isinstance(result, SceneTextFailure):
            return MergeRequestFailure(422, result.code, f"{index + 1}番目のテキストの場面: {result.message}")
        scenes[index] = TextScene(lines=result, duration_tenths=item.duration_tenths)
    return scenes
