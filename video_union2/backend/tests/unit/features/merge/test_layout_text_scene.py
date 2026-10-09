import pytest

from app.features.merge.layout_text_scene import layout_text_scene


def test_font_size_comes_from_the_short_side_of_the_output():
    assert layout_text_scene(1920, 1080, [100]).font_size == 48
    assert layout_text_scene(1080, 1920, [100]).font_size == 48
    assert layout_text_scene(640, 360, [100]).font_size == 16


def test_one_line_is_centered_on_the_output():
    assert layout_text_scene(640, 360, [100]).line_centers == ((320.0, 180.0),)


def test_five_lines_are_spaced_by_one_and_a_half_font_sizes_around_the_middle():
    layout = layout_text_scene(1920, 1080, [100, 200, 300, 200, 100])

    assert layout.line_centers == (
        (960.0, 396.0), (960.0, 468.0), (960.0, 540.0), (960.0, 612.0), (960.0, 684.0),
    )


def test_line_width_up_to_90_percent_of_the_output_width_is_allowed():
    assert layout_text_scene(1080, 1920, [972.0]).font_size == 48


def test_line_wider_than_90_percent_of_the_output_width_is_rejected_without_its_text():
    with pytest.raises(ValueError) as error:
        layout_text_scene(1080, 1920, [100.0, 973.0])

    assert str(error.value) == "2行目の幅 973px が出力 1080x1920 の描ける幅 972px を超えています"


def test_output_with_short_side_23_has_font_size_1_and_smaller_is_rejected():
    assert layout_text_scene(24, 23, [1.0]).font_size == 1
    with pytest.raises(ValueError) as error:
        layout_text_scene(16, 16, [1.0])

    assert str(error.value) == "出力 16x16 では文字の大きさが1ピクセル未満になります"
