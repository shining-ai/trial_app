import shutil
import time
from app.lib.disk_storage import DiskStorage
from app.lib.logger import log_error, log_info

_NAME = "lib.cleanup_stale_files"


def cleanup_stale_files(storage: DiskStorage, stale_hours: int) -> None:
    """アップロード動画と結合のフォルダのうち、更新時刻が stale_hours より古いものを消す。

    消せないものがあれば記録して例外を送出する(起動は失敗する)。
    """
    started = time.monotonic()
    threshold = time.time() - stale_hours * 3600
    removed = 0
    for directory in (storage.uploads_dir(), storage.merges_dir()):
        if not directory.exists():
            continue
        for entry in directory.iterdir():
            try:
                if entry.stat().st_mtime >= threshold:
                    continue
                # 想定と違う種類のもの(uploads のフォルダ、merges のファイル)も種類に応じて消す
                shutil.rmtree(entry) if entry.is_dir() and not entry.is_symlink() else entry.unlink()
            except OSError as e:
                log_error(_NAME, "古いファイルの削除に失敗しました", err=e,
                          ms=round((time.monotonic() - started) * 1000))
                raise
            removed += 1
    if removed:
        log_info(_NAME, "古いファイルを削除しました", removed=removed)
