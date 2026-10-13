from app.features.merge.merge_segment import TextScene
from app.features.merge.normalize_text_items import normalize_text_items
from app.features.merge.schemas import TextItem, VideoItem

FONT = frozenset(ord(c) for c in "京都嵐山あ■")


def _v(i):
    return VideoItem(type="video", video_id=f"{i:032x}")


def _t(text, tenths=30):
    return TextItem(type="text", text=text, duration_tenths=tenths)


def test_valid_text_scenes_are_returned_by_their_list_position():
    scenes = normalize_text_items([_t("京都\n嵐山", 30), _v(1), _t(" 　■\n", 55)], FONT)

    assert scenes == {0: TextScene(("京都", "嵐山"), 30), 2: TextScene(("■",), 55)}


def test_no_text_scenes_give_an_empty_mapping():
    assert normalize_text_items([_v(1), _v(2)], FONT) == {}


def test_first_failure_is_returned_with_the_list_position_in_the_message():
    failure = normalize_text_items([_v(1), _t("あ" * 21), _t("😀")], FONT)

    assert (failure.status, failure.code, failure.message) == (
        422, "invalid_text_scene", "2番目のテキストの場面: 1行は20文字までです(1行目が21文字)")


def test_unsupported_characters_keep_their_code_and_cause():
    failure = normalize_text_items([_t("京都"), _v(1), _t("京都😀")], FONT)

    assert (failure.code, failure.message) == (
        "unsupported_characters", "3番目のテキストの場面: 表示できない文字が含まれています: 😀")
