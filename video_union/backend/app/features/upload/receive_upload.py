import time
from collections.abc import AsyncIterator
from pathlib import Path

from app.lib.errors import AppError
from app.lib.logger import log_info

_SLOW_MS = 1000


async def receive_upload(chunks: AsyncIterator[bytes], dest: Path, max_bytes: int) -> int:
    """本文を少しずつ dest に書き、書いたバイト数を返す。

    上限を超えた時点で受信を打ち切り、書きかけのファイルを消して 413 の AppError を送出する。
    それ以外の失敗でも書きかけのファイルを消して、元の例外を送出する。
    """
    started = time.monotonic()
    dest.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with dest.open("wb") as f:
            async for chunk in chunks:
                size += len(chunk)
                if size > max_bytes:
                    raise AppError(413, "file_too_large", "ファイルサイズが上限の4GBを超えています")
                f.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    elapsed_ms = round((time.monotonic() - started) * 1000)
    if elapsed_ms > _SLOW_MS:
        log_info("upload.receive_upload", "アップロードの受信が完了しました", size_bytes=size, ms=elapsed_ms)
    return size
