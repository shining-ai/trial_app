import shutil
import time
from pathlib import Path

from app.lib.disk_storage import DiskStorage
from app.lib.logger import log_error, log_info

_NAME = "lib.cleanup_stale_files"


def cleanup_stale_files(storage: DiskStorage, stale_hours: int) -> None:
    """アップロード動画と結合のフォルダのうち、更新時刻が stale_hours より古いものを消す。

    消せないものがあれば記録して例外を送出する(起動は失敗する)。
    """
    threshold = time.time() - stale_hours * 3600
    removed = 0
    for directory, remove in ((storage.uploads_dir(), _unlink), (storage.merges_dir(), shutil.rmtree)):
        if not directory.exists():
            continue
        for entry in directory.iterdir():
            if entry.stat().st_mtime >= threshold:
                continue
            try:
                remove(entry)
            except OSError as e:
                log_error(_NAME, "古いファイルの削除に失敗しました", err=e)
                raise
            removed += 1
    if removed:
        log_info(_NAME, "古いファイルを削除しました", removed=removed)


def _unlink(path: Path) -> None:
    path.unlink()
