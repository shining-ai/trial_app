from datetime import datetime
from pathlib import Path

from app.features.download.build_download_name import build_download_name
from app.lib.disk_storage import DiskStorage, InvalidIdError
from app.lib.errors import AppError


def find_download(job_id: str, storage: DiskStorage) -> tuple[Path, str]:
    """結合結果のパスとダウンロード名を返す。結果がなければ 404 の AppError を送出する。

    成功したジョブだけが result.mp4 を持つため、実行中・失敗のジョブも 404 になる。
    """
    try:
        path = storage.merge_result_path(job_id)
    except InvalidIdError as e:
        raise _not_found() from e
    if not path.is_file():
        raise _not_found()
    completed_at = datetime.fromtimestamp(path.stat().st_mtime).astimezone()
    return path, build_download_name(completed_at)


def _not_found() -> AppError:
    return AppError(404, "result_not_found", "結合結果が見つかりません")
