import json
import logging

import pytest

from app.features.merge.load_scene_font import load_scene_font
from app.lib.config import Settings


def _font_errors(caplog):
    return [r for r in caplog.records if getattr(r, "fields", {}).get("name") == "merge.load_scene_font"]


def test_default_font_has_japanese_kana_kanji_symbols_and_latin_but_not_emoji():
    font = load_scene_font(Settings().scene_font_path)

    assert {ord(c) in font.code_points for c in "あア漢■A1、。「」"} == {True}
    assert ord("😀") not in font.code_points
    assert font.path == Settings().scene_font_path


def test_missing_font_is_logged_without_its_path_and_reraised(tmp_path, caplog):
    caplog.set_level(logging.INFO)
    missing = tmp_path / "secret-dir" / "nothing.ttf"

    with pytest.raises(FileNotFoundError):
        load_scene_font(missing)

    errors = _font_errors(caplog)
    assert [r.levelname for r in errors] == ["ERROR"]
    assert errors[0].fields["setting"] == "SCENE_FONT_PATH"
    assert errors[0].fields["err"]["type"] == "FileNotFoundError"
    assert "secret-dir" not in json.dumps(errors[0].fields, ensure_ascii=False) + errors[0].getMessage()


def test_file_that_is_not_a_font_is_logged_and_reraised(tmp_path, caplog):
    caplog.set_level(logging.INFO)
    not_font = tmp_path / "secret-dir" / "font.ttf"
    not_font.parent.mkdir()
    not_font.write_text("これはフォントではありません")

    with pytest.raises(Exception):
        load_scene_font(not_font)

    errors = _font_errors(caplog)
    assert len(errors) == 1
    assert errors[0].fields["setting"] == "SCENE_FONT_PATH"
    assert "secret-dir" not in json.dumps(errors[0].fields, ensure_ascii=False) + errors[0].getMessage()


def test_unreadable_font_is_logged_without_its_path(tmp_path, caplog):
    caplog.set_level(logging.INFO)
    # ファイルの代わりにフォルダを指すと、開くときに OSError になり、その文言には通常パスが入る
    directory = tmp_path / "secret-dir" / "font.ttf"
    directory.mkdir(parents=True)

    with pytest.raises(Exception):
        load_scene_font(directory)

    errors = _font_errors(caplog)
    assert len(errors) == 1
    assert "secret-dir" not in json.dumps(errors[0].fields, ensure_ascii=False) + errors[0].getMessage()


def test_app_does_not_start_when_the_font_is_missing(settings, make_client, tmp_path):
    with pytest.raises(FileNotFoundError):
        make_client(settings, scene_font_path=tmp_path / "nothing.ttf")
