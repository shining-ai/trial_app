import unicodedata
from dataclasses import dataclass


_MAX_LINES = 5
_MAX_LINE_CHARS = 20
_MAX_TOTAL_CHARS = 100
_MAX_REPORTED_CAUSES = 5
_FORBIDDEN_CATEGORIES = frozenset({"Cc", "Cf"})
_WHITESPACE = frozenset(" 　\n")


@dataclass(frozen=True)
class SceneTextFailure:
    code: str
    message: str


def _control_name(char: str) -> str:
    if char == "\t":
        return "タブ"
    if char == "\r":
        return "復帰"
    return f"U+{ord(char):04X}"


def _unsupported(causes: list[str]) -> SceneTextFailure:
    shown = list(dict.fromkeys(causes))[:_MAX_REPORTED_CAUSES]
    return SceneTextFailure("unsupported_characters", f"表示できない文字が含まれています: {' '.join(shown)}")


def normalize_scene_text(text: str, font_code_points: frozenset[int]) -> tuple[str, ...] | SceneTextFailure:
    text = text.replace("\r\n", "\n")
    text = unicodedata.normalize("NFC", text)
    # 取り除く処理より前に確かめる(先頭・末尾のタブなども拒否するため)
    forbidden = [c for c in text if c != "\n" and unicodedata.category(c) in _FORBIDDEN_CATEGORIES]
    if forbidden:
        return _unsupported([_control_name(c) for c in forbidden])
    # str.strip() の引数なしは使わない(タブや U+0085 まで取り除き、画面の trim() と食い違うため)
    text = text.strip("".join(_WHITESPACE))
    if not text:
        return SceneTextFailure("invalid_text_scene", "テキストを入力してください")
    missing = [c for c in text if c not in _WHITESPACE and ord(c) not in font_code_points]
    if missing:
        return _unsupported(missing)
    lines = text.split("\n")
    if len(lines) > _MAX_LINES:
        return SceneTextFailure("invalid_text_scene", f"{_MAX_LINES}行までです({len(lines)}行あります)")
    for number, line in enumerate(lines, start=1):
        if len(line) > _MAX_LINE_CHARS:
            return SceneTextFailure(
                "invalid_text_scene", f"1行は{_MAX_LINE_CHARS}文字までです({number}行目が{len(line)}文字)")
    total = sum(len(line) for line in lines)
    if total > _MAX_TOTAL_CHARS:
        return SceneTextFailure("invalid_text_scene", f"全体で{_MAX_TOTAL_CHARS}文字までです({total}文字あります)")
    return tuple(lines)
