from pathlib import Path

from app.lib.media_input_policy import input_restriction_args

# 表示の枠(120×68px)の2倍。縦横の比を保ってこの枠に収める
_MAX_WIDTH = 240
_MAX_HEIGHT = 135


def build_thumbnail_args(input_path: Path, output_path: Path, *, video_stream_index: int) -> list[str]:
    """動画の先頭のコマを、縮小した JPEG にする FFmpeg の引数を組み立てる。"""
    return [
        "ffmpeg", "-y", "-nostdin", "-v", "error", *input_restriction_args(), "-i", str(input_path),
        "-map", f"0:{video_stream_index}",
        "-frames:v", "1",
        "-vf", f"scale={_MAX_WIDTH}:{_MAX_HEIGHT}:force_original_aspect_ratio=decrease",
        "-q:v", "4",
        # 出力名の % を連番のパターンとして解釈させず、1枚の画像として書く
        "-f", "image2", "-update", "1",
        str(output_path),
    ]
