import json

from app.features.merge.merge_source import MergeSource
from app.lib.disk_storage import DiskStorage, InvalidIdError
from app.lib.errors import AppError

_SUPPORTED_VERSION = 1


def load_merge_sources(video_ids: list[str], storage: DiskStorage) -> list[MergeSource]:
    """アップロード時に保存されたメタ情報を、指定の順に MergeSource として読む。"""
    sources = []
    for video_id in video_ids:
        try:
            path = storage.upload_metadata_path(video_id)
        except InvalidIdError as e:
            raise _not_found() from e
        if not path.exists() or not storage.upload_video_path(video_id).exists():
            raise _not_found()
        data = json.loads(path.read_text())
        if data.get("version") != _SUPPORTED_VERSION:
            raise ValueError(f"メタ情報の version {data.get('version')} には対応していません")
        sources.append(
            MergeSource(
                video_id=video_id,
                file_name=data["file_name"],
                size_bytes=data["size_bytes"],
                duration_seconds=data["duration_seconds"],
                width=data["width"],
                height=data["height"],
                fps_num=data["fps_num"],
                fps_den=data["fps_den"],
                has_audio=data["has_audio"],
                video_stream_index=data["video_stream_index"],
                audio_stream_index=data["audio_stream_index"],
            )
        )
    return sources


def _not_found() -> AppError:
    return AppError(422, "video_not_found", "指定された動画が見つかりません")
