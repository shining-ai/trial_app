from app.features.merge.normalize_scene_text import SceneTextFailure, normalize_scene_text

FONT = frozenset(ord(c) for c in "京都嵐山年月日が2026109abcあ𠮷")


def _run(text, font=FONT):
    result = normalize_scene_text(text, font)
    if isinstance(result, SceneTextFailure):
        return (result.code, result.message)
    return result


def test_single_line_and_multiple_lines_are_split_into_a_tuple():
    assert _run("京都") == ("京都",)
    assert _run("2026年10月9日\n京都 嵐山") == ("2026年10月9日", "京都 嵐山")


def test_crlf_is_treated_as_a_line_break():
    assert _run("京都\r\n嵐山") == ("京都", "嵐山")


def test_surrounding_spaces_fullwidth_spaces_and_blank_lines_are_removed():
    assert _run("\n　京都 \n\n") == ("京都",)
    assert _run("  京都\n嵐山　") == ("京都", "嵐山")


def test_inner_blank_line_and_inner_line_trailing_space_are_kept():
    assert _run("京都\n\n嵐山") == ("京都", "", "嵐山")
    assert _run("京都 \n嵐山") == ("京都 ", "嵐山")


def test_empty_whitespace_only_and_newline_only_text_is_rejected():
    expected = ("invalid_text_scene", "テキストを入力してください")
    assert _run("") == expected
    assert _run("  　 ") == expected
    assert _run("\n\n") == expected
    assert _run(" \n　\r\n ") == expected


def _unsupported(chars):
    return ("unsupported_characters", f"表示できない文字が含まれています: {chars}")


def test_control_and_format_characters_are_rejected_and_named():
    assert _run("京\t都") == _unsupported("タブ")
    assert _run("京\u0007都") == _unsupported("U+0007")
    assert _run("京​都") == _unsupported("U+200B")
    assert _run("京‮都") == _unsupported("U+202E")
    assert _run("京\r都") == _unsupported("復帰")


def test_leading_and_trailing_tab_are_rejected_instead_of_being_trimmed():
    assert _run("\t京都") == _unsupported("タブ")
    assert _run("京都\t") == _unsupported("タブ")
    assert _run("\t") == _unsupported("タブ")


def test_leading_bom_and_trailing_next_line_character_are_rejected():
    assert _run("﻿京都") == _unsupported("U+FEFF")
    assert _run("京都\u0085") == _unsupported("U+0085")


def test_control_characters_are_reported_in_order_without_duplicates_up_to_five():
    assert _run("\t\u0007\t​\u0007") == _unsupported("タブ U+0007 U+200B")
    assert _run("\u0001\u0002\u0003\u0004\u0005\u0006\u0007") == _unsupported(
        "U+0001 U+0002 U+0003 U+0004 U+0005")


def test_control_characters_take_precedence_over_unsupported_glyphs():
    assert _run("😀\t") == _unsupported("タブ")


def test_character_missing_from_the_font_is_rejected_and_shown_as_is():
    assert _run("京😀都") == _unsupported("😀")


def test_missing_characters_are_reported_once_each_in_order_up_to_five():
    assert _run("😀京😀都😁") == _unsupported("😀 😁")
    assert _run("甲乙丙丁戊己庚") == _unsupported("甲 乙 丙 丁 戊")


def test_missing_character_is_reported_before_the_line_and_length_limits():
    assert _run("😀\n京\n都\n嵐\n山\n年") == _unsupported("😀")
    assert _run("京" * 21 + "😀") == _unsupported("😀")


def test_spaces_and_fullwidth_spaces_are_accepted_even_if_not_in_the_font():
    font = frozenset(ord(c) for c in "京都")

    assert _run("京 都　京", font) == ("京 都　京",)
    assert _run("京\n都", font) == ("京", "都")


def test_five_lines_are_allowed_and_six_lines_are_rejected():
    assert _run("京\n都\n嵐\n山\n年") == ("京", "都", "嵐", "山", "年")
    assert _run("京\n都\n嵐\n山\n年\n月") == ("invalid_text_scene", "5行までです(6行あります)")


def test_inner_blank_lines_count_toward_the_line_limit():
    assert _run("京\n\n都\n\n嵐\n\n山") == ("invalid_text_scene", "5行までです(7行あります)")


def test_line_of_20_characters_is_allowed_and_21_is_rejected_with_the_line_number():
    assert _run("京" * 20) == ("京" * 20,)
    assert _run("京" * 21) == ("invalid_text_scene", "1行は20文字までです(1行目が21文字)")
    assert _run("京都\n嵐山\n" + "京" * 23 + "\n" + "京" * 25) == (
        "invalid_text_scene", "1行は20文字までです(3行目が23文字)")


def test_surrogate_pair_character_counts_as_one_character():
    assert _run("𠮷" * 20) == ("𠮷" * 20,)
    assert _run("𠮷" * 21) == ("invalid_text_scene", "1行は20文字までです(1行目が21文字)")


def test_five_lines_of_20_characters_are_allowed_as_100_characters_in_total():
    text = "\n".join(["京" * 20] * 5)

    assert _run(text) == ("京" * 20,) * 5


def test_nfd_voiced_kana_is_composed_and_counted_as_one_character():
    assert _run("が") == ("が",)
    assert _run("が" * 20) == ("が" * 20,)
    assert _run("が" * 21) == ("invalid_text_scene", "1行は20文字までです(1行目が21文字)")
