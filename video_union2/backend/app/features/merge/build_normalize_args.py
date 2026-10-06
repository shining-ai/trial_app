from pathlib import Path

from app.features.merge.merge_source import MergeSource
from app.features.merge.plan_output_format import OutputFormat
from app.lib.media_input_policy import input_restriction_args

_SILENT_AUDIO = "anullsrc=r=48000:cl=stereo"


def build_normalize_args(
    source: MergeSource,
    output: OutputFormat,
    *,
    input_path: Path,
    output_path: Path,
    preset: str,
    crf: int,
) -> list[str]:
    """1本の動画を、出力の解像度・fps・音声に揃える1段目の FFmpeg の引数を組み立てる。

    拡大はせず、中央に置いて縁を黒で埋める。音声がなければ無音を入れ、音声は映像の長さに合わせる。
    """
    w, h = output.width, output.height
    video_chain = (
        f"[0:{source.video_stream_index}]pad={w}:{h}:({w}-iw)/2:({h}-ih)/2:color=black,"
        f"setsar=1,fps={output.fps_num}/{output.fps_den},format=yuv420p[v]"
    )
    audio_input = f"[0:{source.audio_stream_index}]" if source.has_audio else "[1:a:0]"
    audio_chain = f"{audio_input}aresample=48000,aformat=channel_layouts=stereo,apad[a]"

    # -xerror: 途中で切れた・壊れた入力を、短い出力のまま成功にしない
    args = ["ffmpeg", "-y", "-nostdin", "-v", "error", "-xerror", *input_restriction_args(), "-i", str(input_path)]
    if not source.has_audio:
        args += ["-f", "lavfi", "-i", _SILENT_AUDIO]
    args += [
        "-filter_complex", f"{video_chain};{audio_chain}",
        "-map", "[v]", "-map", "[a]",
        "-t", str(source.duration_seconds), "-shortest",
        "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
        "-video_track_timescale", "90000",
        "-progress", "pipe:1", "-nostats",
        str(output_path),
    ]
    return args
