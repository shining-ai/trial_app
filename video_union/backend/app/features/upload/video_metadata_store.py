import json
from pathlib import Path

from app.features.upload.video_info import VideoInfo

METADATA_VERSION = 1


def write_metadata(
    path: Path, temp_path: Path, *, video_id: str, file_name: str, size_bytes: int, info: VideoInfo
) -> None:
    """メタ情報ファイルを書く(書きかけのファイルが読まれないよう、別名で書いてから置き換える)。"""
    data = {
        "version": METADATA_VERSION,
        "id": video_id,
        "file_name": file_name,
        "size_bytes": size_bytes,
        "duration_seconds": info.duration_seconds,
        "width": info.width,
        "height": info.height,
        "fps_num": info.fps_num,
        "fps_den": info.fps_den,
        "has_audio": info.has_audio,
        "video_stream_index": info.video_stream_index,
        "audio_stream_index": info.audio_stream_index,
    }
    temp_path.write_text(json.dumps(data, ensure_ascii=False))
    temp_path.replace(path)


def delete_metadata(path: Path) -> None:
    path.unlink(missing_ok=True)
