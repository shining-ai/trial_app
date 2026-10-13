from dataclasses import dataclass


@dataclass(frozen=True)
class UploadSizeFailure:
    status: int
    code: str
    message: str


def check_upload_size(declared_size: int | None, *, max_bytes: int, free_bytes: int) -> UploadSizeFailure | None:
    """受信を始める前に、申告されたサイズ(Content-Length)が上限と空き容量に収まるかを確かめる。

    申告がないときは判定しない(受信中の上限の確認に任せる)。
    """
    if declared_size is None:
        return None
    if declared_size > max_bytes:
        return UploadSizeFailure(413, "file_too_large", "ファイルサイズが上限の4GBを超えています")
    if declared_size > free_bytes:
        return UploadSizeFailure(507, "insufficient_storage", "保存先の空き容量が足りません")
    return None
