from PIL import Image

from app.features.merge.render_text_scene import render_text_scene
from app.lib.config import Settings

FONT = Settings().scene_font_path
WHITE, BLACK = (255, 255, 255), (0, 0, 0)


def _render(tmp_path, lines, width, height, name="scene.png"):
    path = tmp_path / name
    render_text_scene(lines, width=width, height=height, font_path=FONT, image_path=path)
    return Image.open(path).convert("RGB")


def _bright_bbox(image):
    return image.convert("L").point(lambda v: 255 if v > 128 else 0).getbbox()


def test_square_glyph_is_white_at_the_center_on_a_black_background(tmp_path):
    image = _render(tmp_path, ("■",), 640, 360)

    assert image.size == (640, 360)
    assert image.getpixel((320, 180)) == WHITE
    assert [image.getpixel(p) for p in ((0, 0), (639, 0), (0, 359), (639, 359))] == [BLACK] * 4


def test_five_lines_of_twenty_full_width_glyphs_stay_inside_five_percent_margins(tmp_path):
    lines = ("■" * 20,) * 5
    for width, height in ((1080, 1920), (1920, 1080)):
        left, top, right, bottom = _bright_bbox(_render(tmp_path, lines, width, height, f"{width}.png"))

        assert left >= width * 0.05 and right <= width * 0.95, (width, height, left, right)
        assert top >= height * 0.05 and bottom <= height * 0.95, (width, height, top, bottom)


def test_blank_middle_line_is_kept_between_the_other_lines(tmp_path):
    image = _render(tmp_path, ("■", "", "■"), 640, 360)
    # 文字の大きさ 16、行の高さ 24。行の中心は y=156, 180, 204
    assert image.getpixel((320, 156)) == WHITE
    assert image.getpixel((320, 180)) == BLACK
    assert image.getpixel((320, 204)) == WHITE


def test_japanese_text_is_drawn_inside_the_margins(tmp_path):
    left, top, right, bottom = _bright_bbox(_render(tmp_path, ("あいう漢字ABC",), 640, 360))

    assert 32 <= left < 320 < right <= 608
    assert 160 < top < 180 < bottom < 200


def test_same_text_renders_the_same_image(tmp_path):
    first = _render(tmp_path, ("京都", "嵐山"), 640, 360, "a.png")
    second = _render(tmp_path, ("京都", "嵐山"), 640, 360, "b.png")

    assert first.tobytes() == second.tobytes()
