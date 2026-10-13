from pathlib import Path

from app.lib.media_input_policy import input_restriction_args


def build_probe_args(path: Path) -> list[str]:
    """ffprobe の引数を組み立てる。パスの前に `--` を置き、オプションとして解釈させない。"""
    return [
        "ffprobe", *input_restriction_args(),
        "-v", "error", "-print_format", "json", "-show_format", "-show_streams",
        "--", str(path),
    ]
