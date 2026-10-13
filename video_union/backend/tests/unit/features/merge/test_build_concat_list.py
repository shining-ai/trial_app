from pathlib import Path

import pytest

from app.features.merge.build_concat_list import build_concat_list

PARTS = Path("/data/merges/j/parts")


def test_list_has_file_lines_in_order():
    text = build_concat_list([PARTS / "0002.mp4", PARTS / "0001.mp4"], parts_dir=PARTS)

    assert text == "ffconcat version 1.0\nfile '/data/merges/j/parts/0002.mp4'\nfile '/data/merges/j/parts/0001.mp4'\n"


def test_single_quote_in_path_is_escaped():
    text = build_concat_list([PARTS / "it's.mp4"], parts_dir=PARTS)

    assert "file '/data/merges/j/parts/it'\\''s.mp4'" in text


@pytest.mark.parametrize("outside", [Path("/data/uploads/a.bin"), PARTS / ".." / ".." / "x.mp4", Path("/etc/passwd")])
def test_path_outside_parts_dir_is_rejected(outside):
    with pytest.raises(ValueError):
        build_concat_list([PARTS / "0001.mp4", outside], parts_dir=PARTS)
