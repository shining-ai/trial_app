import time

from app.features.upload.video_metadata_store import delete_metadata
from app.lib.disk_storage import DiskStorage, InvalidIdError
from app.lib.errors import AppError
from app.lib.logger import log_error



def delete_video(video_id: str, storage: DiskStorage) -> None:
    """アップロード済みの動画ファイルとメタ情報を消す。"""
    try:
        video = storage.upload_video_path(video_id)
        metadata = storage.upload_metadata_path(video_id)
    except InvalidIdError as e:
        raise _not_found() from e
    if not video.exists() and not metadata.exists():
        raise _not_found()
    started = time.monotonic()
    try:
        video.unlink(missing_ok=True)
        delete_metadata(metadata)
    except OSError as e:
        log_error("upload.delete_video", "動画の削除に失敗しました", err=e, video_ids=[video_id],
                  ms=round((time.monotonic() - started) * 1000))
        raise


def _not_found() -> AppError:
    return AppError(404, "video_not_found", "指定された動画が見つかりません")
