from pathlib import Path

from app.features.merge.build_encode_args import build_encode_args
from app.features.merge.plan_output_format import OutputFormat

_SILENT_AUDIO = "anullsrc=r=48000:cl=stereo"


def build_text_scene_args(
    output: OutputFormat,
    *,
    image_path: Path,
    output_path: Path,
    frames: int,
    seconds: float,
    preset: str,
    crf: int,
) -> list[str]:
    """テキストの場面の PNG を、出力の fps・指定のフレーム数・無音の中間ファイルにする FFmpeg の引数を組み立てる。

    入力はアプリが描いた PNG だけなので、開ける形式を image2 に限る。利用者の文字は引数に入らない。
    """
    fps = f"{output.fps_num}/{output.fps_den}"
    return [
        "ffmpeg", "-y", "-nostdin", "-v", "error", "-xerror",
        # pattern_type none: パスの % を連番の書式として解釈させない
        "-protocol_whitelist", "file", "-format_whitelist", "image2", "-f", "image2", "-pattern_type", "none",
        "-loop", "1", "-framerate", fps, "-i", str(image_path),
        "-f", "lavfi", "-i", _SILENT_AUDIO,
        "-filter_complex", f"[0:v]setsar=1,fps={fps},format=yuv420p[v]",
        "-map", "[v]", "-map", "1:a",
        "-frames:v", str(frames), "-t", f"{seconds:.6f}",
        *build_encode_args(preset=preset, crf=crf),
        "-progress", "pipe:1", "-nostats",
        str(output_path),
    ]
