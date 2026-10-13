from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.features.merge.layout_text_scene import layout_text_scene, text_scene_font_size

_BACKGROUND = (0, 0, 0)
_TEXT = (255, 255, 255)


def render_text_scene(lines: tuple[str, ...], *, width: int, height: int, font_path: Path, image_path: Path) -> None:
    """黒い背景の中央に白い文字で行を描き、出力の幅・高さの PNG に保存する。

    描けない出力サイズ・行の幅のときは、layout_text_scene の ValueError をそのまま送出する。
    """
    font = ImageFont.truetype(str(font_path), text_scene_font_size(width, height))
    layout = layout_text_scene(width, height, [font.getlength(line) for line in lines])
    image = Image.new("RGB", (width, height), _BACKGROUND)
    draw = ImageDraw.Draw(image)
    for line, center in zip(lines, layout.line_centers):
        if line:
            draw.text(center, line, font=font, fill=_TEXT, anchor="mm")
    image.save(image_path, format="PNG")
