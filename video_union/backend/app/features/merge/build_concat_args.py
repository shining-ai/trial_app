from pathlib import Path


def build_concat_args(list_path: Path, output_path: Path) -> list[str]:
    """中間ファイルを再エンコードなしでつなぐ2段目の FFmpeg の引数を組み立てる。"""
    return [
        "ffmpeg", "-y", "-nostdin", "-v", "error",
        "-protocol_whitelist", "file", "-f", "concat", "-safe", "0", "-i", str(list_path),
        "-c", "copy", "-movflags", "+faststart",
        str(output_path),
    ]
