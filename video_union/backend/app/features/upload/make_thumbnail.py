from pathlib import Path

from app.features.upload.build_thumbnail_args import build_thumbnail_args
from app.lib.run_process import run_process


async def make_thumbnail(input_path: Path, output_path: Path, *, video_stream_index: int, timeout_seconds: float) -> None:
    """動画の先頭のコマからサムネイルの JPEG を作る。失敗したら ProcessFailedError を送出する。"""
    await run_process(
        build_thumbnail_args(input_path, output_path, video_stream_index=video_stream_index),
        timeout_seconds=timeout_seconds,
    )
