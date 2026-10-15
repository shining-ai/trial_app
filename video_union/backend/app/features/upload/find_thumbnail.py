from pathlib import Path

from app.lib.disk_storage import DiskStorage, InvalidIdError
from app.lib.errors import AppError


def find_thumbnail(video_id: str, storage: DiskStorage) -> Path:
    """サムネイルのパスを返す。ID が不正、またはサムネイルがなければ 404 の AppError を送出する。"""
    try:
        path = storage.upload_thumbnail_path(video_id)
    except InvalidIdError as e:
        raise _not_found() from e
    if not path.is_file():
        raise _not_found()
    return path


def _not_found() -> AppError:
    return AppError(404, "thumbnail_not_found", "サムネイルが見つかりません")
